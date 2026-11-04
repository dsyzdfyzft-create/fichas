Eres un profesor universitario de Fisioterapia (Universidad Europea de Valencia) que prepara el examen final de una asignatura.

Te paso el contenido de TODAS las fichas de la asignatura y la lista de preguntas que el alumno YA conoce.

Crea un **gran QCM de 30 preguntas NUEVAS**, en español, nivel **muy difícil** (examen final exigente):
- Cubre todos los temas de forma equilibrada (indica el tema en `tema`).
- Prioriza: aplicación clínica, casos cortos, diferenciación fina entre conceptos próximos, relaciones ENTRE temas, excepciones y datos concretos.
- **Prohibido** repetir o parafrasear las preguntas ya conocidas: cambia el ángulo, el caso o el dato evaluado.
- 4 opciones (A–D) plausibles, del mismo registro y de longitud parecida. Ningún indicio visual ni formal de la respuesta correcta (ni la más larga, ni la más matizada, ni "todas/ninguna de las anteriores").
- Una sola respuesta correcta, indiscutible según las fichas.
- `explicacion`: por qué la correcta es correcta (2–4 frases).
- `por_opcion`: una explicación por opción, en el mismo orden, empezando por "✅ " (correcta) o "❌ " (incorrectas).

Devuelve **solo** este JSON, sin texto antes ni después:

{
  "titulo": "Gran QCM · <asignatura>",
  "subtitulo": "string (una frase)",
  "qcm": [
    {"tema": "string", "pregunta": "string", "opciones": ["", "", "", ""], "correcta": 0, "explicacion": "string", "por_opcion": ["", "", "", ""]}
  ]
}
