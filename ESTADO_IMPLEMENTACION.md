# Estado de implementación

## Implementado

- Página de ventas en castellano de Uruguay con las secciones solicitadas, fondos crema/blanco, Poppins, teal `#2A9D8F`, navy `#2B2D42`, amarillo `#FDCB6E` y rojo `#E63946`, conforme a la referencia inspeccionada visualmente.
- Responsive mediante CSS, navegación por anclas, FAQ nativas desplegables, diálogo accesible con cierre por Escape, preferencias de movimiento reducido, estados de error y HTML escapado al renderizar contenido administrable.
- Ilustración SVG original de cuadernos y tarjetas. La demostración es interactiva e ilustrativa, no un video ficticio ni archivos terapéuticos reales.
- Catálogo inicial marcado `pending`. No se inventan testimonios, ventas, acreditaciones, descuentos ni urgencia.
- Precios centralizados, promociones configurables, oferta opcional total, conversión desde UYU con proveedor real, caché, fecha, advertencia de aproximación, selector recordado y fallback UYU. País por IP opcional con aceptación; después región de navegador/Uruguay.
- Cuentas, contraseñas scrypt con sal, sesiones persistentes HttpOnly, Secure en producción, CSRF, validación de Origin, límite de intentos y cabeceras de seguridad.
- Biblioteca por plan, búsqueda y filtro, vista PDF y descarga autorizada en cada solicitud. Archivos fuera de `public/`.
- Administrador por rol exclusivamente desde servidor, precios/productos/promos, altas y ediciones de materiales/bonos, carga PDF, estados, FAQ, testimonios autorizados, datos legales y consulta de pedidos.
- Persistencia SQLite con archivos locales privados; requiere volumen persistente y una sola réplica.
- Integración Mercado Pago server-side preparada: preferencia, precio recalculado, webhook HMAC, consulta a API, validación e idempotencia. La falta de configuración o catálogo bloquea cobros. Reembolsos y contracargos notificados revocan acceso.
- Secretos solo por entorno del servidor. Panel muestra estado de configuración sin mostrar ni almacenar claves en frontend.
- SEO en castellano, Open Graph, canonical, sitemap, robots y noindex en páginas privadas.
- Dockerfile y CI GitHub, sin dependencia de Lovable ni paquetes externos npm.

## Verificado

- `npm run check`: sintaxis servidor, núcleo y frontend.
- `npm test`: ocho pruebas (incluyen un flujo HTTP de múltiples verificaciones): contraseñas, permisos, oferta total, condiciones de activación, firma válida/inválida/vencida, moneda/importe/vendedor, registro sin elevación de privilegios, denegación de PDF sin compra, CSRF y Origin, carga PDF con licencia, acceso por compra y revocación tras reembolso, precio persistido, webhook sin credenciales bloqueado, rutas privadas y cabeceras.
- Proveedor de tipos de cambio respondió correctamente con base UYU durante la implementación. La app sigue funcionando en UYU si el proveedor no responde.
- Referencia inspeccionada en un navegador y por captura completa para obtener paleta y estructura; no se reutilizan sus imágenes.

## No verificado / pendiente

- No se completó QA visual del resultado en navegador: el entorno de preview administrado no expone el control de navegador requerido. El CSS incluye adaptación móvil y escritorio; requiere revisión visual tras desplegar. No se afirma fidelidad visual perfecta ni una puntuación Lighthouse.
- No hay 160 archivos originales o licenciados entregados. Los registros iniciales son categorías/bonos, no materiales listos para usar.
- No se recibieron credenciales ni se hicieron cobros. Mercado Pago debe validarse end-to-end en su entorno de prueba y contra la cuenta uruguaya real antes de abrir ventas.
- Pasarela internacional sin proveedor contratado: no implementada; el sistema explica y bloquea esa ruta. Se requiere un proveedor elegible en Uruguay, sus credenciales, adaptador y pruebas.
- Garantía de 15 días prevista pero no activa. Se requieren vendedor, RUT/contacto, condiciones y política de reembolso reales y revisión legal.
- Sin testimonios autorizados recibidos; sección vacía con explicación honesta.
- Sin correo transaccional, verificación de propiedad del correo ni recuperación automática de contraseña. Preparar esos procesos antes del lanzamiento comercial. El acceso funciona con correo/contraseña sin envío de correo.
- Falta monitoreo de pagos, alertas, conciliación periódica de pedidos y proceso operativo de devolución de dinero en la pasarela.
- Falta política definitiva de retención/eliminación de datos y validación normativa del responsable. No almacenar datos clínicos de pacientes.
- Dockerfile preparado pero no construido/probado aquí. No se ha contratado hosting ni configurado dominio, HTTPS, copias de seguridad o volumen de producción.
- No está publicado en un dominio público. GitHub contiene código; requiere un servidor Node.js. GitHub Pages no puede ofrecer las funciones privadas.

No se consumieron créditos de Lovable ni se creó un proyecto en esa plataforma para esta implementación.
