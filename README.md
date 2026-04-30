# Dashboard Plan Maestro de Formación 📊

Sistema de visualización y análisis de desempeño para el Plan Maestro de Formación 2026. Este dashboard permite monitorear el cumplimiento, notas promedio y análisis de preguntas críticas de los diferentes pilares de la compañía.

## 🚀 Proceso de Actualización de Datos

Para actualizar el dashboard con nuevos datos de los Excels, sigue estos pasos:

### 1. Preparar los archivos Excel
- Descarga los reportes actualizados de Microsoft Forms/Excel.
- Colócalos en la carpeta correspondiente según el pilar:
  - `apartado pilar de gente/`
  - `apartado pilar de seguridad/`
  - `apartado pilar de flota/`
  - `apartado pilar de reparto/`
  - `apartado pilar de gestion/`
- Asegúrate de que los archivos tengan la extensión `.xlsx`.

### 2. Ejecutar el script de procesamiento
Abre una terminal en la carpeta raíz del proyecto y ejecuta:
```bash
node generar_datos.js
```
Este script realizará las siguientes tareas automáticamente:
- **Deduplicación:** Si un usuario tiene múltiples intentos, se queda con el de mayor puntaje.
- **Limpieza:** Filtra preguntas de satisfacción (encuestas) y se enfoca en preguntas evaluativas.
- **Generación:** Crea los archivos JSON en la carpeta `/data` que alimentan el dashboard.

### 3. Subir los cambios a GitHub
Una vez generados los nuevos datos, sincroniza con el repositorio remoto:
```bash
git add .
git commit -m "Actualización de datos: [Fecha]"
git push origin main
```

### 4. Visualización Online
El dashboard se actualiza automáticamente en la web a través de **GitHub Pages** unos segundos después del `push`.
- **URL:** `https://sajona-rg.github.io/Plan-Maestro-de-Formacion/`

---

## 🛠️ Estructura del Proyecto

- `index.html`: Estructura principal del dashboard.
- `js/app.js`: Lógica de filtrado, persistencia y renderizado de gráficos (Chart.js).
- `css/style.css`: Estilos y diseño responsivo.
- `data/`: Contiene los archivos JSON procesados (Gente, Seguridad, etc.).
- `generar_datos.js`: Script Node.js para transformar Excels en JSON.

## 🧠 Auditoría y Rigor de Datos
- **Nivel de Confianza:** El encabezado muestra el Margen de Error dinámico (±%) calculado con un 95% de confianza.
- **Deduplicación:** Se garantiza que cada colaborador cuente como una participación única por módulo.
- **Rendimiento:** Las animaciones están optimizadas para una carga rápida y fluida en cualquier navegador.

---
*Desarrollado con rigor de análisis de datos senior.*
