# Respaldo externo de PostgreSQL — WebAlma

Este procedimiento protege **la base de datos PostgreSQL**. No respalda archivos locales de una instancia de Render, variables de entorno, configuraciones de cuentas externas ni los archivos del propio repositorio (para esto se conserva GitHub).

## Situación del servicio

- Instancia Render: `webalma-database` (PostgreSQL 18, plan **Free**).
- Fecha de expiración informada por Render al 26/11/2026: **09/12/2026, 04:18 UTC** (08/12/2026, 22:18 hora de Ciudad de México).
- El plan Free **no ofrece backups administrados, PITR ni alta disponibilidad**. No confundir un servicio desplegado en Render con un respaldo.
- El trabajo `.github/workflows/respaldo-postgresql.yml` ejecuta `pg_dump` diariamente, **solo después de configurar los dos secretos** abajo. Los respaldos se cifran antes de entrar en el almacenamiento de GitHub Actions.

## Activación (una sola vez, por la administradora)

1. En Render > `webalma-database` > Info/Connect, copiar **External Database URL**. Nunca introducirla en un archivo, issue, chat o commit.
2. En GitHub > repositorio WebAlma > Settings > Secrets and variables > Actions > New repository secret, crear:
   - `WEBALMA_BACKUP_DATABASE_URL`: External Database URL de Render, **no la URL interna**. La URL permite leer datos: mantener privada.
   - `WEBALMA_BACKUP_PASSPHRASE`: frase única y aleatoria de al menos 24 caracteres. **Guardar una copia en un gestor de contraseñas fuera de GitHub**; es imprescindible para recuperar un respaldo. No compartirla por chat ni incluirla en manuales.
3. Abrir GitHub > Actions > **Respaldo cifrado de PostgreSQL - WebAlma** > Run workflow, ejecutar sobre `main`.
4. Verificar que la ejecución termine en verde y que incluya un artefacto `webalma-postgresql-cifrado-...`. Descargar el archivo cifrado a un almacenamiento privado **independiente de GitHub y Render** (por ejemplo, unidad externa o carpeta privada de la empresa).
5. Comprobar periódicamente que el respaldo se puede descifrar y leer usando `pg_restore --list`. Probar la restauración **exclusivamente en una base de prueba aislada**, no sobre la base original.

No se ejecutará con éxito ningún respaldo hasta introducir ambos secretos. Una prueba CI exitosa del repositorio **no equivale a haber generado un respaldo real**.

## Rescate / restauración (solo con autorización de la responsable)

Descargar el archivo `.dump.gpg` desde Actions > ejecución de respaldo > Artifacts; descomprimir ZIP. En un equipo seguro, introducir la frase de cifrado de forma local (nunca en argumentos de terminal o capturas) y descifrar:

```sh
gpg --output webalma-restauracion.dump --decrypt webalma-AAAA-MM-DDTHH-MM-SSZ.dump.gpg
pg_restore --list webalma-restauracion.dump
```

`gpg` pedirá la contraseña. Para restaurar en **una base nueva y vacía**, ya creada para recuperación:

```sh
pg_restore --dbname="URL_DE_BASE_NUEVA" --no-owner --no-privileges --exit-on-error webalma-restauracion.dump
```

**No usar** la URL de la base de producción, `--clean` ni `--create` en una restauración sin revisión. Eliminar el archivo descifrado del equipo cuando termine la prueba.

## Límites y mantenimiento

- La programación de GitHub Actions puede retrasarse y sus artefactos expiran; 30 días de retención **no son un archivo permanente**. Guardar copias fuera de ambas plataformas.
- El repositorio es público: **nunca** subir dumps `.sql`, `.dump`, `.zip`, `.env` o credenciales, ni siquiera temporalmente. Solo artefactos ya cifrados.
- Si no hay ejecución verde reciente, considerar que no existe un respaldo comprobado.
- Los backups se hacen cuando el servicio PostgreSQL es accesible; una caída anterior al siguiente respaldo puede causar pérdida de cambios recientes.
- Un backup no impide que el sitio esté caído. La disponibilidad requiere además un servidor/BD funcionando y, para continuidad a largo plazo, migrar antes de la expiración o contratar un plan adecuado.
- El plan pagado de Render puede habilitar recuperación a un punto anterior; cualquier cambio con costo necesita autorización de quien administra la cuenta.

Referencias:
- https://render.com/docs/free
- https://render.com/docs/postgresql-backups
- https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
