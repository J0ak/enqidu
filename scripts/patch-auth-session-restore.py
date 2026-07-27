from pathlib import Path

path = Path("src/main.jsx")
raw = path.read_bytes()
has_bom = raw.startswith(b"\xef\xbb\xbf")
text = raw.decode("utf-8-sig")
newline = "\r\n" if "\r\n" in text else "\n"
normalized = text.replace("\r\n", "\n").replace("\r", "\n")

old = '''  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      loadBackofficeData(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      loadBackofficeData(nextSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);
'''

new = '''  useEffect(() => {
    if (!supabase) return;

    let cancelled = false;
    const refreshIfNeeded = async () => {
      const { data: currentData, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;

      let nextSession = currentData?.session || null;
      const expiresAtMs = Number(nextSession?.expires_at || 0) * 1000;
      const needsRefresh = !nextSession || (expiresAtMs > 0 && expiresAtMs <= Date.now() + 60_000);

      if (needsRefresh) {
        const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
        if (cancelled) return;
        if (!refreshError && refreshedData?.session) nextSession = refreshedData.session;
        else if (sessionError || refreshError) console.warn("Auth session restore failed", refreshError?.message || sessionError?.message);
      }

      setSession(nextSession);
      if (nextSession?.user?.id) {
        await loadBackofficeData(nextSession);
      } else {
        setSessions([]);
        setPlannedSessions([]);
        setDataState({ loading: false, source: "Sesión requerida", detail: "Vuelve a autenticarte para sincronizar tus datos." });
      }
    };

    refreshIfNeeded();

    const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled || event === "INITIAL_SESSION") return;
      setSession(nextSession);
      window.setTimeout(() => {
        if (cancelled) return;
        if (nextSession?.user?.id) loadBackofficeData(nextSession);
        else {
          setSessions([]);
          setPlannedSessions([]);
        }
      }, 0);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);
'''

count = normalized.count(old)
if count != 1:
    raise SystemExit(f"Expected one auth bootstrap block, found {count}")
patched = normalized.replace(old, new, 1)
if newline == "\r\n":
    patched = patched.replace("\n", "\r\n")
encoded = patched.encode("utf-8")
if has_bom:
    encoded = b"\xef\xbb\xbf" + encoded
path.write_bytes(encoded)
print("Patched auth bootstrap/session refresh")
