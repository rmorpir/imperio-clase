# Elementia — modo clase (varios alumnos)

## Qué hace
- Cada alumno entra con **nombre + código de clase + PIN de 4 cifras** (sin cuentas ni correo). El PIN sirve para recuperar la ciudad otro día o desde otro dispositivo.
- 🗺️ **Mapa del mundo**: cada jugador tiene su territorio; los demás lo ven tapado por la niebla (solo se ve nombre, puntos y si está conectado). El mundo crece con el número de jugadores. Cada ciudad se calcula en el dispositivo de su dueño, por eso nadie ve la ciudad del otro.
- 💾 **Guardado**: la ciudad se guarda en el dispositivo y también en el servidor (cada ~45 s y al cerrar). Al volver con nombre + PIN se recupera la partida más reciente.
- 📝 **Obras con examen**: construir exige recursos y aprobar preguntas; más importante el edificio, más preguntas y más difíciles.
- 🎵 Música y efectos sintetizados en el navegador (se pueden desactivar en ⚙️ Más).
- Cada alumno tiene su ranking común (puntos, edad, preguntas dominadas, conectado/no). Todos los de un mismo código ven el ranking (puntos, edad, preguntas dominadas, conectado/no).
- ⚔️ **Saqueo**: el atacante acierta 2 de 3 preguntas; el defensor tiene 45 s para responder 1 pregunta (si acierta, pierde ~5 % de cada recurso; si falla o no responde, ~15 %, con tope por edad). Después queda protegido 2,5 min. Espera de 60 s entre ataques.
- 🎁 **Regalo**: el donante acierta 1 pregunta; máx. 150 de cada recurso; máx. 4 regalos por minuto.
- 👩‍🏫 **Vista del profesor** (pantalla de título): ranking en directo con el código, para proyectar.
- En modo clase no hay saqueadores del ordenador: el reto son los compañeros.

## Publicarlo (hace falta tu cuenta de Netlify)
Requiere Node 18+ en tu ordenador. En esta carpeta (`aula`):
    npm install
    npx netlify-cli login
    npx netlify-cli deploy --prod --build=false      (la primera vez te pregunta si creas un sitio nuevo)
Solo hace falta que el *CLI* despliegue: arrastrar la carpeta en la web NO empaqueta bien la función con su dependencia (@netlify/blobs).
URL resultante: la que muestre Netlify (p. ej. https://tu-sitio.netlify.app). Dásela a los alumnos y diles el código de clase (3-10 letras/números, lo inventas tú).
No funciona abriendo el .html suelto: necesita la URL pública.

## Límites (sé honesto con la clase)
- **Probado**: servidor con almacén en memoria + 3 navegadores a la vez (ranking, regalo, saqueo con/sin defensa, protección, profesor, reanudar). **No probado** sobre Netlify real ni con alumnos reales: haz una prueba con 2 móviles antes de la clase.
- **Confianza en el cliente**: los recursos los guarda cada navegador; un alumno hábil podría alterarlos con las herramientas del navegador. El servidor limita regalos, botín y frecuencia, pero no puede verificar la economía. Para uso en clase es suficiente; no para competiciones con premio.
- Un alumno solo aparece "conectado" si su pestaña está abierta y activa (los navegadores frenan pestañas en segundo plano).
- Para atacar o recibir regalos el otro debe estar conectado.
- Nombres repetidos en una clase no se permiten; para recuperar tu jugador usa el mismo dispositivo.
- El PIN de 4 cifras es una protección ligera (evita que un compañero use tu nombre por descuido), no una contraseña segura.
- Los datos de clase son nombres de pila, puntos y la partida guardada, sin cuentas ni correo. Aun así, usa apodos si el centro lo prefiere.
