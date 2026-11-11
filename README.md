# Kit Consultorio Lúdico · Uruguay

Implementación propia, independiente de Lovable. Landing responsive en castellano, biblioteca de compradores y administración privada en un solo proyecto. Código en GitHub; **no consume créditos de Lovable**.

**Estado: versión de preparación. No se procesan ventas de materiales pendientes. No está desplegada en un dominio público.**

## Ejecutar

Requiere **Node.js 24 o superior**. No hay dependencias npm que instalar.

```bash
git clone https://github.com/Bicimarket-UY/kit-consultorio-ludico.git
cd kit-consultorio-ludico
cp .env.example .env
npm start
```

Abrir http://localhost:3000. La carpeta `data/` se crea automáticamente y contiene la base SQLite, sesiones y PDF privados. Está excluida de Git. Nunca la sirvas como carpeta estática.

```bash
npm run check
npm test
```

## Administración

1. Crear una cuenta desde `/biblioteca`, con correo y contraseña de al menos 12 caracteres.
2. En el servidor, usando la misma configuración `DATA_DIR`, ejecutar:

```bash
npm run admin -- tu-correo@ejemplo.com
```

3. Ingresar a `/admin`. Nadie puede obtener el rol desde el navegador. No hay contraseña de administrador predefinida.

Desde el panel se modifican precios UYU, disponibilidad, promociones, materiales y bonos, preguntas, testimonios autorizados, políticas y datos comerciales. Los pedidos son de solo lectura; su aprobación requiere confirmación de la pasarela. Las credenciales se gestionan exclusivamente en variables de entorno del hosting, nunca en un formulario frontend.

## Publicar desde GitHub

**GitHub guarda el código. GitHub Pages no puede ejecutar este servidor**, SQLite ni la entrega privada. Usá un hosting compatible con Node.js 24 y **disco persistente** (un VPS, un servicio de contenedores o una plataforma con volúmenes). Los planes gratuitos y sus límites cambian; esta implementación no contrata ningún servicio ni garantiza alojamiento gratuito.

Configuración de despliegue:

- Repositorio: este proyecto; rama `main`.
- Comando de inicio: `npm start`.
- Versión de Node: 24.
- `NODE_ENV=production`.
- `APP_ORIGIN=https://tu-dominio.example` (dominio exacto, sin rutas).
- `DATA_DIR=/ruta/del/volumen/persistente`.
- Puerto: el que indique el proveedor mediante `PORT`; por defecto 3000.
- Healthcheck: `/api/health`.
- Una sola réplica de la app; SQLite y archivos viven en el mismo volumen.
- HTTPS obligatorio. El proxy debe limitar el tamaño de subida a 15 MB como máximo.
- No activar `TRUST_PROXY=true` a menos que el proxy de confianza elimine y reescriba `X-Forwarded-For` y `X-Country-Code`.
- Copias de seguridad de SQLite mediante su API de backup (o parada controlada de la aplicación) y de `data/files/`. No copiar solo `app.sqlite` mientras WAL está activo.

Docker opcional:

```bash
docker build -t consultorio-ludico .
docker volume create consultorio-data
docker run -d --name consultorio \
  -p 127.0.0.1:3000:3000 \
  --env-file .env.production \
  --mount source=consultorio-data,target=/app/data \
  consultorio-ludico
```

Crear `.env.production` **fuera de Git** con `APP_ORIGIN` HTTPS y secretos. Colocar un proxy HTTPS delante del contenedor. No se construyó ni publicó una imagen Docker en esta entrega; el Dockerfile es una opción de despliegue.

## Catálogo y entrega

Los registros iniciales son **categorías y bonos pendientes**, no 160 PDF. La ilustración SVG es propia y representa una propuesta. No contiene ni ofrece archivos comerciales de la referencia.

- Cargar PDF originales/autorizados desde el panel y documentar su licencia.
- Cada PDF disponible exige archivo y licencia; máximo 10 MB por archivo.
- Esencial accede a sus recursos; Completo accede también a bonos.
- No hay enlaces públicos al almacenamiento. Cada vista o descarga vuelve a comprobar sesión, estado del recurso y derecho de acceso.
- Solo pagos aprobados por el servidor dan acceso. Crear una cuenta, elegir plan o volver del checkout no lo concede.
- Un reembolso, reembolso parcial o contracargo notificado revoca el acceso correspondiente.
- La protección básica no impide que una persona que ya descargó un PDF lo copie. No es DRM.

## Precios y monedas

Valores iniciales UYU 590 / UYU 790. Oferta opcional de UYU 690 **total** para elegir Completo desde Esencial, desactivada por defecto. Se activa en Administración → Precios y productos. No es un cargo extra de UYU 690.

`prices` es la única fuente de precios. Se persiste en SQLite y se publica mediante `/api/config`; el servidor vuelve a calcular el checkout, sin aceptar el importe del cliente.

Conversiones desde UYU a monedas ISO 4217 usando ExchangeRate-API (`open.er-api.com`). Caché de seis horas persistida en SQLite, fecha de actualización, solicitudes concurrentes agrupadas, caché vencida marcada hasta siete días. Si falla y no hay tasas válidas, se muestran UYU. Nunca hay tasas ficticias. Formato `Intl.NumberFormat`, redondeo visual a enteros; la conversión es orientativa y no fija la moneda de cobro. La página acredita al proveedor cuando usa sus tasas.

País: selección manual recordada → IP aproximada con aceptación y si el operador habilita `ENABLE_IP_GEO=true` → región del navegador → Uruguay. No usa GPS. La IP no se envía a terceros sin la aceptación de la interfaz. La consulta externa usa ipapi.co; revisá sus condiciones y límites antes de activarla.

## Mercado Pago Uruguay

Preparado, **no probado con credenciales comerciales** y desactivado sin configuración:

1. Completar vendedor, contacto, condiciones de uso y política real de reembolso.
2. Cargar el catálogo con derechos y verificar que el contenido anunciado exista. Marcar productos listos.
3. Configurar `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` y opcionalmente `MP_COLLECTOR_ID` en el servidor.
4. En Mercado Pago, registrar eventos de pagos en `https://tu-dominio/api/webhooks/mercadopago`. La firma usa `data.id` de la query y `x-signature` / `x-request-id` según la especificación de Mercado Pago.
5. Probar con credenciales de prueba y checkout de prueba antes de usar credenciales reales. La integración actual entrega el enlace `init_point`; usar el entorno y las cuentas de prueba indicados por Mercado Pago para la validación.
6. Verificar firma, evento duplicado, importe adulterado, vendedor, pago rechazado, pago pendiente, reembolso y contracargo.
7. Recién entonces activar ventas.

El servidor crea una preferencia UYU únicamente para país UY y moneda UYU. No promete que Mercado Pago Uruguay procese todas las monedas. La vuelta del navegador **no aprueba** un pedido. El webhook comprueba HMAC, antigüedad de la firma y consulta el pago por API; valida referencia, importe, moneda y vendedor opcional. Los eventos son idempotentes y un pedido reembolsado no se reactiva automáticamente.

Los reembolsos se tramitan en Mercado Pago conforme a la política comercial; esta versión no inicia devoluciones por API. Si un webhook falla o no llega, el pedido queda pendiente: antes del lanzamiento implementar monitoreo y un proceso de conciliación con la pasarela. No cambiar estados a mano para simular pagos.

## Pasarela internacional

**Pendiente de seleccionar, contratar e implementar** un proveedor que acepte un comerciante radicado en Uruguay. No se presupone elegibilidad de Stripe ni se simula una integración. El servidor rechaza el checkout internacional con un mensaje claro. Elegir proveedor y validar países, monedas, webhooks y liquidación antes de anunciar aceptación internacional.

## Antes de abrir ventas

Consultar [ESTADO_IMPLEMENTACION.md](ESTADO_IMPLEMENTACION.md). Faltan materiales, datos comerciales, política de reembolso real, revisión legal, correo transaccional/recuperación de contraseña, validación de identidad de correo, pruebas de la pasarela real y alojamiento. No es una tienda comercial lista para cobrar hoy.

## Estructura

- `public/`: página, estilos, biblioteca/admin y arte SVG original.
- `src/server.js`: HTTP, sesiones, API, pagos y entrega protegida.
- `src/core.js`: permisos, precios, validación y firma de webhooks.
- `src/db.js`: SQLite y datos iniciales pendientes.
- `scripts/admin.js`: otorgar rol por consola del servidor.
- `test/`: pruebas de permisos, acceso, configuración y validación de pagos.
- `.github/workflows/ci.yml`: verificaciones en push y PR.

Implementación original inspirada visualmente en https://kitconsultorioludico.vercel.app/. No se copiaron su código, imágenes comerciales ni testimonios.
