-- #104: ENQIDU opaque OAuth credentials. Review only; no production apply.
BEGIN;
CREATE SCHEMA mcp_private;
REVOKE ALL ON SCHEMA mcp_private FROM PUBLIC, anon, authenticated, service_role;
-- No password/login is enabled by this migration. Operator provisions a dedicated
-- pooler login after review; this role can execute only the closed functions below.
CREATE ROLE enqidu_mcp_oauth NOLOGIN NOINHERIT NOBYPASSRLS;
GRANT USAGE ON SCHEMA mcp_private TO enqidu_mcp_oauth;
ALTER DEFAULT PRIVILEGES IN SCHEMA mcp_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE mcp_private.authorization_requests (
 request_hash text PRIMARY KEY CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 client_id text NOT NULL CHECK(length(client_id)<=200),
 redirect_uri text NOT NULL CHECK(length(redirect_uri)<=2048),
 resource text NOT NULL CHECK(length(resource)<=2048),
 scopes text[] NOT NULL CHECK(scopes <@ ARRAY['enqidu.read','enqidu.preview','offline_access'] AND 'enqidu.read'=ANY(scopes)),
 state text NOT NULL CHECK(length(state) BETWEEN 1 AND 1024),
 challenge text NOT NULL CHECK(challenge ~ '^[A-Za-z0-9_-]{43}$'),
 user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','denied')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '10 minutes')
);
CREATE INDEX ON mcp_private.authorization_requests(created_at);
CREATE TABLE mcp_private.grants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 client_id text NOT NULL, resource text NOT NULL, scopes text[] NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '90 days'),
 revoked_at timestamptz
);
CREATE INDEX ON mcp_private.grants(user_id);
CREATE TABLE mcp_private.authorization_codes (
 hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'),
 grant_id uuid NOT NULL REFERENCES mcp_private.grants(id) ON DELETE CASCADE,
 redirect_uri text NOT NULL, challenge text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '5 minutes'),
 consumed_at timestamptz
);
CREATE INDEX ON mcp_private.authorization_codes(grant_id);
CREATE TABLE mcp_private.tokens (
 hash text PRIMARY KEY CHECK(hash ~ '^[a-f0-9]{64}$'),
 grant_id uuid NOT NULL REFERENCES mcp_private.grants(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('access','refresh')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz, revoked_at timestamptz
);
CREATE INDEX ON mcp_private.tokens(grant_id);
-- No table access even for the runtime role. Definer functions are the narrow
-- authorization service, not a workaround to let the client bypass RLS.
ALTER TABLE mcp_private.authorization_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_private.grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_private.authorization_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_private.tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA mcp_private FROM PUBLIC, anon, authenticated, service_role, enqidu_mcp_oauth;

CREATE FUNCTION mcp_private.user_active(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=now()))
$$;

CREATE FUNCTION mcp_private.create_request_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(104,1);
 -- Bounded cleanup and durable admission cap, independent of serverless memory.
 DELETE FROM mcp_private.authorization_requests WHERE request_hash IN
  (SELECT request_hash FROM mcp_private.authorization_requests WHERE expires_at<now()-interval '1 day' LIMIT 100);
 DELETE FROM mcp_private.grants WHERE id IN
  (SELECT id FROM mcp_private.grants WHERE expires_at<now() LIMIT 100);
 IF (SELECT count(*) FROM mcp_private.authorization_requests WHERE created_at>now()-interval '1 minute')>=120 THEN
  RETURN jsonb_build_object('error','temporarily_unavailable'); END IF;
 INSERT INTO mcp_private.authorization_requests(request_hash,client_id,redirect_uri,resource,scopes,state,challenge)
 VALUES(p->>'request_hash',p->>'client_id',p->>'redirect_uri',p->>'resource',ARRAY(SELECT jsonb_array_elements_text(p->'scopes')),p->>'state',p->>'challenge');
 RETURN '{}'::jsonb;
END $$;

CREATE FUNCTION mcp_private.request_details_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r mcp_private.authorization_requests;
BEGIN
 IF NOT mcp_private.user_active((p->>'user_id')::uuid) THEN RETURN jsonb_build_object('error','invalid_grant'); END IF;
 SELECT * INTO r FROM mcp_private.authorization_requests WHERE request_hash=p->>'request_hash' FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' OR r.expires_at<=now() OR (r.user_id IS NOT NULL AND r.user_id<>(p->>'user_id')::uuid) THEN
  RETURN jsonb_build_object('error','invalid_grant'); END IF;
 UPDATE mcp_private.authorization_requests SET user_id=(p->>'user_id')::uuid WHERE request_hash=r.request_hash;
 RETURN jsonb_build_object('client_id',r.client_id,'redirect_uri',r.redirect_uri,'resource',r.resource,'scopes',r.scopes);
END $$;

CREATE FUNCTION mcp_private.decide_request_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r mcp_private.authorization_requests; gid uuid;
BEGIN
 IF NOT mcp_private.user_active((p->>'user_id')::uuid) THEN RETURN jsonb_build_object('error','invalid_grant'); END IF;
 SELECT * INTO r FROM mcp_private.authorization_requests WHERE request_hash=p->>'request_hash' FOR UPDATE;
 IF NOT FOUND OR r.status<>'pending' OR r.expires_at<=now() OR r.user_id IS DISTINCT FROM (p->>'user_id')::uuid
 OR r.resource IS DISTINCT FROM p->>'resource' OR r.client_id IS DISTINCT FROM p->>'client_id'
 OR p->>'decision' NOT IN ('approve','deny') THEN RETURN jsonb_build_object('error','invalid_grant'); END IF;
 UPDATE mcp_private.authorization_requests SET status=CASE WHEN p->>'decision'='approve' THEN 'approved' ELSE 'denied' END WHERE request_hash=r.request_hash;
 IF p->>'decision'='approve' THEN
  INSERT INTO mcp_private.grants(user_id,client_id,resource,scopes) VALUES(r.user_id,r.client_id,r.resource,r.scopes) RETURNING id INTO gid;
  INSERT INTO mcp_private.authorization_codes(hash,grant_id,redirect_uri,challenge) VALUES(p->>'code_hash',gid,r.redirect_uri,r.challenge);
 END IF;
 RETURN jsonb_build_object('redirect_uri',r.redirect_uri,'state',r.state);
END $$;

-- Internal helper: no EXECUTE grant to runtime. Secrets are minted by Node crypto;
-- SQL receives only hashes. The grant is the single source of identity/resource/scopes.
CREATE FUNCTION mcp_private.issue_tokens(g mcp_private.grants,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE exp timestamptz:=least(clock_timestamp()+interval '60 minutes',g.expires_at); refresh boolean:='offline_access'=ANY(g.scopes);
BEGIN
 INSERT INTO mcp_private.tokens(hash,grant_id,kind,expires_at) VALUES(p->>'access_hash',g.id,'access',exp);
 IF refresh THEN INSERT INTO mcp_private.tokens(hash,grant_id,kind,expires_at)
 VALUES(p->>'refresh_hash',g.id,'refresh',least(clock_timestamp()+interval '30 days',g.expires_at)); END IF;
 RETURN jsonb_build_object('scope',array_to_string(g.scopes,' '),'expires_in',greatest(0,floor(extract(epoch FROM exp-clock_timestamp())))::int,'refresh',refresh);
END $$;

CREATE FUNCTION mcp_private.consume_authorization_code_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c mcp_private.authorization_codes; g mcp_private.grants;
BEGIN
 SELECT * INTO c FROM mcp_private.authorization_codes WHERE hash=p->>'code_hash' FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','invalid_grant'); END IF;
 SELECT * INTO g FROM mcp_private.grants WHERE id=c.grant_id FOR UPDATE;
 IF NOT FOUND OR c.consumed_at IS NOT NULL OR c.expires_at<=now() OR g.revoked_at IS NOT NULL OR g.expires_at<=now()
 OR NOT mcp_private.user_active(g.user_id) OR g.client_id IS DISTINCT FROM p->>'client_id' OR g.resource IS DISTINCT FROM p->>'resource'
 OR c.redirect_uri IS DISTINCT FROM p->>'redirect_uri' OR c.challenge IS DISTINCT FROM p->>'challenge' THEN
 RETURN jsonb_build_object('error','invalid_grant'); END IF;
 UPDATE mcp_private.authorization_codes SET consumed_at=clock_timestamp() WHERE hash=c.hash;
 RETURN mcp_private.issue_tokens(g,p);
END $$;

CREATE FUNCTION mcp_private.rotate_refresh_token_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t mcp_private.tokens; g mcp_private.grants;
BEGIN
 -- Lock the grant FIRST for every token operation; serialize the whole family.
 SELECT g0.* INTO g FROM mcp_private.grants g0 JOIN mcp_private.tokens t0 ON t0.grant_id=g0.id WHERE t0.hash=p->>'refresh_hash_old' AND t0.kind='refresh' FOR UPDATE OF g0;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','invalid_grant'); END IF;
 SELECT * INTO t FROM mcp_private.tokens WHERE hash=p->>'refresh_hash_old';
 IF g.client_id IS DISTINCT FROM p->>'client_id' OR g.resource IS DISTINCT FROM p->>'resource' THEN RETURN jsonb_build_object('error','invalid_grant'); END IF;
 IF t.consumed_at IS NOT NULL THEN
  UPDATE mcp_private.grants SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE id=g.id;
  -- Return, do not raise: replay revocation MUST COMMIT even though OAuth fails.
  RETURN jsonb_build_object('error','invalid_grant'); END IF;
 IF t.revoked_at IS NOT NULL OR t.expires_at<=now() OR g.revoked_at IS NOT NULL OR g.expires_at<=now() OR NOT mcp_private.user_active(g.user_id) THEN RETURN jsonb_build_object('error','invalid_grant'); END IF;
 IF p ? 'scope' AND p->>'scope' IS DISTINCT FROM array_to_string(g.scopes,' ') THEN RETURN jsonb_build_object('error','invalid_scope'); END IF;
 UPDATE mcp_private.tokens SET consumed_at=clock_timestamp() WHERE hash=t.hash;
 RETURN mcp_private.issue_tokens(g,p);
END $$;

CREATE FUNCTION mcp_private.resolve_access_token_v1(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('user_id',g.user_id,'client_id',g.client_id,'resource',g.resource,'scopes',g.scopes,'expires_at',extract(epoch FROM least(t.expires_at,g.expires_at)))
 FROM mcp_private.tokens t JOIN mcp_private.grants g ON g.id=t.grant_id
 WHERE t.hash=p->>'token_hash' AND t.kind='access' AND t.revoked_at IS NULL AND t.expires_at>now()
 AND g.revoked_at IS NULL AND g.expires_at>now() AND g.resource=p->>'resource' AND g.client_id=p->>'client_id'
 AND mcp_private.user_active(g.user_id)
$$;
CREATE FUNCTION mcp_private.connections_v1(p jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (SELECT id,client_id,scopes,created_at,expires_at FROM mcp_private.grants
 WHERE user_id=(p->>'user_id')::uuid AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 50) x
$$;
CREATE FUNCTION mcp_private.revoke_grant_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE mcp_private.grants SET revoked_at=coalesce(revoked_at,clock_timestamp()) WHERE id=(p->>'grant_id')::uuid AND user_id=(p->>'user_id')::uuid;
 RETURN '{}'::jsonb;
END $$;
CREATE FUNCTION mcp_private.revoke_token_v1(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 UPDATE mcp_private.grants g SET revoked_at=coalesce(g.revoked_at,clock_timestamp())
 WHERE g.client_id=p->>'client_id' AND EXISTS(SELECT 1 FROM mcp_private.tokens t WHERE t.hash=p->>'token_hash' AND t.grant_id=g.id);
 RETURN '{}'::jsonb;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mcp_private FROM PUBLIC, anon, authenticated, service_role, enqidu_mcp_oauth;
GRANT EXECUTE ON FUNCTION mcp_private.create_request_v1(jsonb),mcp_private.request_details_v1(jsonb),mcp_private.decide_request_v1(jsonb),
 mcp_private.consume_authorization_code_v1(jsonb),mcp_private.rotate_refresh_token_v1(jsonb),mcp_private.resolve_access_token_v1(jsonb),
 mcp_private.connections_v1(jsonb),mcp_private.revoke_grant_v1(jsonb),mcp_private.revoke_token_v1(jsonb) TO enqidu_mcp_oauth;

-- Retain only the canonical read adapters required by the privileged read facade.
CREATE OR REPLACE FUNCTION public.ai_context_request_role()
RETURNS text LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT coalesce(nullif(auth.jwt()->>'role',''),nullif(current_setting('request.jwt.claim.role',true),''),'')
$$;
CREATE FUNCTION public.read_training_semantics_for_mcp_v1(p_user_id uuid,p_session_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT training_semantics.state(p_user_id,p_session_id)
$$;
REVOKE ALL ON FUNCTION public.read_training_semantics_for_mcp_v1(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_training_semantics_for_mcp_v1(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
