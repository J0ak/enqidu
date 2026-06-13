# Sport Elements

Aplicacion web movil para rendimiento humano: Boyle, HYROX, DEKA, Trail y CrossFit, en ese orden. La interfaz combina smart cards de salud/actividad, carga Garmin/FIT y un coach conversacional local.

## Ejecutar

```powershell
npm.cmd install
npm.cmd run dev
```

URL local del PC:

```text
http://127.0.0.1:5174
```

URL desde otro dispositivo de la misma red:

```text
http://192.168.1.187:5174
```

Si desde otro dispositivo no abre, normalmente es firewall de Windows para Node/Vite.

## Supabase

Proyecto consultado: `Hybriq` (`rdduqsziboqxlgeqouxq`).

La app incluye una seccion `Backoffice` y una tarjeta de autenticacion en `Profile`.

La app intenta leer/sincronizar:

- `wearable_health_daily`
- `training_sessions`
- `profiles`
- `user_wearable_connections`
- `training_sources`

Para activar lectura desde el navegador crea `.env.local`:

```env
VITE_SUPABASE_URL=https://rdduqsziboqxlgeqouxq.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=tu_publishable_key
```

La URL ya esta configurada en `.env.local`; falta pegar la publishable key desde Supabase Dashboard:

```text
Project Settings -> API Keys -> Publishable key
```

Despues de editar `.env.local`, reinicia Vite:

```powershell
npm.cmd run dev
```

Sin key la app funciona en modo demo. Con key pero sin login, RLS bloqueara tus datos privados. Con login, RLS permite leer/escribir filas donde `user_id = auth.uid()`.

## Garmin / FIT

La integracion operativa inicial es:

1. Cargar `.fit` desde la seccion `Activity`.
2. Validar cabecera/tamano/fecha/checksum en cliente.
3. Si hay sesion Supabase, registrar la fuente en `training_sources`.
4. Crear entrada de ingestion en `wearable_activity_imports`.
5. Preparar normalizacion futura hacia `training_sessions`, `fit_message_payloads`, `session_samples` y metricas derivadas.

La integracion oficial con Garmin queda marcada desde `Profile` cuando el pipeline FIT este validado.

## Build

```powershell
npm.cmd run build
```

## Estado actual

- React/Vite app navegable por hash.
- Secciones: Home, Health, Activity, Coach, Profile.
- Smart cards por disciplina: Boyle, HYROX, DEKA, Trail, CrossFit.
- Coach conversacional local con contexto de salud/disciplina.
- Carga `.fit` con validacion basica.
- Persistencia local para perfil, mensajes y FIT imports.
- Preparada para Supabase con `@supabase/supabase-js`.
