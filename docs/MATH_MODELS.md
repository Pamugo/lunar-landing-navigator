# MATH_MODELS — Modelos físico-matemáticos

> **Propietario:** `astro-terrain-specialist` · **Revisión QA:** `qa-verification-agent` · Requisitos: RT-01, RT-02, RT-03
> Toda ecuación aquí tiene un oráculo ejecutable en `backend/tests/oracles/horizon_oracle.py` o un plan de validación contra JPL Horizons.

## 0. Constantes y convenciones

| Símbolo | Valor | Fuente / nota |
|---------|-------|---------------|
| $R$ (radio lunar de referencia) | 1 737 400 m (1737.4 km) | Esfera de referencia de LOLA e IAU |
| $R_\odot$ | 695 700 km | IAU 2015 Resolution B3 (radio solar nominal) |
| $R_\oplus$ | 6 378.137 km (ecuatorial) | WGS-84 / IAU; usar ecuatorial para el disco aparente |
| UA | 149 597 870.7 km | IAU 2012 |
| $c$ | 299 792.458 km/s | — |

- Latitud $\varphi$ y longitud $\lambda$ **planetocéntricas**, longitud **este-positiva**, marco **MOON_ME** (Mean Earth / Polar Axis), el marco de referencia de LOLA.
- Ángulos: grados en la API; **radianes** en el motor interno.
- Acimut $A$: desde el norte local, sentido horario (N=0°, E=90°), en $[0°, 360°)$.
- Elevación $e$: ángulo sobre el plano horizontal local (perpendicular a la normal de la esfera).

## 1. Transformación selenográfica → topocéntrica con libración

### 1.1 Posición del observador en el marco fijo al cuerpo (MOON_ME)

$$
\mathbf{r}_{obs}^{ME} = (R + h)\begin{pmatrix}\cos\varphi\cos\lambda\\ \cos\varphi\sin\lambda\\ \sin\varphi\end{pmatrix},
\qquad h = h_{DEM}(\varphi,\lambda) + h_{mástil}
$$

### 1.2 Libración

- **Libración física:** la orientación real de la Luna viene dada por los ángulos de Euler $(\phi, \theta, \psi)(t)$ integrados en las efemérides JPL (kernel binario `moon_pa_de421_1900-2050.bpc` → marco **MOON_PA**).
- **MOON_ME** se obtiene de MOON_PA con una rotación **constante** (kernel de marcos `moon_080317.tf` para DE421; `moon_de440_*.tf` para DE440). Diferencia PA–ME ≈ 0.02°–0.03° (~ 800–900 m en superficie): **no despreciable** para el polo sur.
- **Libración óptica** (en longitud ±7.9°, en latitud ±6.7°) no se modela aparte: emerge automáticamente de la geometría porque la dirección Tierra–Luna se expresa en el marco fijo al cuerpo en cada instante.

Sea $\mathbf{M}(t)$ la matriz de rotación ICRF → MOON_ME. Entonces:

$$
\mathbf{r}_{obs}^{ICRF}(t) = \mathbf{r}_{Luna}^{ICRF}(t) + \mathbf{M}(t)^{\mathsf T}\,\mathbf{r}_{obs}^{ME}
$$

### 1.3 Vector topocéntrico al cuerpo B (Sol o Tierra)

Con corrección de tiempo-luz $\tau$ (iterativa, 2–3 iteraciones convergen):

$$
\boldsymbol{\rho}_B = \mathbf{r}_B^{ICRF}(t - \tau) - \mathbf{r}_{obs}^{ICRF}(t), \qquad \tau = \frac{|\boldsymbol{\rho}_B|}{c}
$$

La aberración estelar debida a la velocidad del observador (~30 km/s respecto al baricentro) desplaza ≈ 20.5″ (0.0057°). Se incluye
(Skyfield `.apparent()`) para ser coherente con la cantidad "apparent AIRLESS" de JPL Horizons.

### 1.4 Base topocéntrica ENU y Az/El

En MOON_ME (esfera ⇒ normal geodésica = geocéntrica):

$$
\hat{\mathbf u} = \begin{pmatrix}\cos\varphi\cos\lambda\\ \cos\varphi\sin\lambda\\ \sin\varphi\end{pmatrix},\quad
\hat{\mathbf e} = \begin{pmatrix}-\sin\lambda\\ \cos\lambda\\ 0\end{pmatrix},\quad
\hat{\mathbf n} = \begin{pmatrix}-\sin\varphi\cos\lambda\\ -\sin\varphi\sin\lambda\\ \cos\varphi\end{pmatrix}
$$

Con $\hat{\boldsymbol\rho} = \mathbf{M}(t)\,\boldsymbol\rho_B / |\boldsymbol\rho_B|$ expresado en ME:

$$
e = \arcsin(\hat{\boldsymbol\rho}\cdot\hat{\mathbf u}), \qquad A = \operatorname{atan2}(\hat{\boldsymbol\rho}\cdot\hat{\mathbf e},\; \hat{\boldsymbol\rho}\cdot\hat{\mathbf n}) \bmod 360°
$$

**Singularidad polar:** en $|\varphi| = 90°$ exactos $\hat{\mathbf e}, \hat{\mathbf n}$ no están definidos. Regla: si $|\varphi| > 89.9999°$ se usa la longitud
proporcionada por el usuario para fijar el meridiano de referencia (documentado en la respuesta). Los sitios reales (p. ej. Shackleton, −89.68°) no están afectados.

### 1.5 Sin refracción atmosférica

La Luna carece de atmósfera: $e_{aparente} = e_{geométrica}$ (salvo tiempo-luz y aberración). **Prohibido** aplicar cualquier modelo de
refracción (Bennett, Saemundsson, etc.). En JPL Horizons usar `APPARENT=AIRLESS`.

## 2. Horizonte topográfico sin atmósfera (RT-02, RT-03)

### 2.1 Elevación angular de un punto del terreno

Observador a distancia radial $r_0 = R + h_0$ (incluye mástil). Punto del terreno $i$ a distancia radial $r_i = R + h_i$ y
distancia superficial (arco de círculo máximo) $d_i$, con ángulo central:

$$
\theta_i = \frac{d_i}{R}
$$

En el plano vertical que contiene al observador, al punto y al centro lunar, el vector observador→punto es
$(r_i\sin\theta_i,\; r_i\cos\theta_i - r_0)$ en coordenadas (horizontal, vertical). Por tanto:

$$
\boxed{\tan\gamma_i = \frac{r_i\cos\theta_i - r_0}{r_i\sin\theta_i}}
$$

**Forma numéricamente estable** (evita cancelación catastrófica cuando $\theta \to 0$), usada en la implementación:

$$
r_i\cos\theta_i - r_0 = (h_i - h_0) - 2\,r_i\sin^2(\theta_i/2), \qquad
\gamma_i = \operatorname{atan2}\!\big((h_i - h_0) - 2 r_i \sin^2(\theta_i/2),\; r_i\sin\theta_i\big)
$$

### 2.2 Casos analíticos (oráculos)

1. **Esfera lisa, observador en superficie** ($h_i = h_0 = 0$): $\tan\gamma = -\tan(\theta/2) \Rightarrow \gamma = -\theta/2$.
2. **Depresión del horizonte geométrico** (observador a altura $h_0$ sobre esfera lisa): el máximo de $\gamma$ sobre la superficie se alcanza en el punto de tangencia:

$$
\delta = \arccos\!\left(\frac{R}{R+h_0}\right) \approx \sqrt{2h_0/R}, \qquad d_{hor} = R\,\delta \approx \sqrt{2Rh_0}
$$

   Ejemplo: $h_0 = 2$ m ⇒ $\delta \approx 0.0869°$, $d_{hor} \approx 2.64$ km.
3. **Límite plano** ($R\to\infty$): $\gamma = \arctan\big((h_i-h_0)/d_i\big)$.
4. **Visibilidad de una cima de altura $H$:** sobresale del horizonte de esfera lisa si $d < \sqrt{2Rh_0} + \sqrt{2RH}$ (≈ 134 km para $h_0=2$ m, $H=5$ km).

### 2.3 Perfil de horizonte 360°

$$
\gamma_h(A) = \max_{i \in \text{rayo}(A)} \gamma_i, \qquad A \in \{0, \Delta A, \dots, 360°-\Delta A\}
$$

- Rayo = círculo máximo desde el observador con acimut inicial $A$ (fórmula de punto de destino esférica).
- Paso radial $\Delta s \le$ resolución del DEM (adaptativo con la distancia permitido: $\Delta s_j = \max(p,\, s_j\tan(\Delta A/2))$).
- Alcance mínimo $L \ge 150$ km en el polo sur (macizos de ~5 km visibles a > 130 km, §2.2.4).
- $\gamma_h(A)$ se interpola **linealmente y de forma circular** en acimut para el acimut del cuerpo.
- Si el rayo sale del DEM antes de $L$ → `truncated = true` en la respuesta.

## 3. Condición de visibilidad del Sol y la Tierra

### 3.1 Radio angular aparente

$$
\alpha_B = \arcsin\!\left(\frac{R_B}{|\boldsymbol\rho_B|}\right)
$$

- Sol: $\alpha_\odot \approx 0.2666°$ a 1 UA (0.2622°–0.2711° a lo largo del año).
- Tierra: $\alpha_\oplus \approx 0.9507°$ a 384 400 km (≈ 0.90° en apogeo, ≈ 1.02° en perigeo).

### 3.2 Estados

Con $\gamma_B = \gamma_h(A_B)$:

| Estado | Condición |
|--------|-----------|
| `visible` (disco completo) | $e_B - \alpha_B > \gamma_B$ |
| `partial` | $\lvert e_B - \gamma_B \rvert \le \alpha_B$ |
| `occulted` | $e_B + \alpha_B < \gamma_B$ |

### 3.3 Fracción visible del disco (horizonte localmente recto, disco uniforme)

$$
x = \frac{\gamma_B - e_B}{\alpha_B}\in[-1,1], \qquad f = \frac{\arccos x - x\sqrt{1-x^2}}{\pi}
$$

($f=1$ si $x\le -1$; $f=0$ si $x\ge 1$.) Simplificaciones declaradas: se ignora la pendiente del horizonte dentro del disco y el oscurecimiento del limbo.

### 3.4 Disponibilidad DTE

$$
\text{DTE}(t) = \big[e_\oplus(t) - \gamma_\oplus(t) \ge m_{DTE}\big]
$$

con máscara de elevación configurable $m_{DTE}$ (por defecto 0°, centro del disco terrestre sobre el horizonte topográfico).

## 4. Eventos: tiempo restante hasta Sunset y Earthset

Funciones de evento (holgura del limbo superior / inferior):

$$
g_{set}(t) = e_B(t) + \alpha_B(t) - \gamma_h(A_B(t)) \quad(\text{ocaso completo: el limbo superior desaparece})
$$
$$
g_{start}(t) = e_B(t) - \alpha_B(t) - \gamma_h(A_B(t)) \quad(\text{inicio del ocaso: el limbo inferior toca el horizonte})
$$

Algoritmo:
1. Muestrear $g$ en malla gruesa $\Delta t$ (10 min por defecto; el Sol se mueve ≈ 0.508°/h en acimut en el polo).
2. Primer intervalo con $g(t_k) > 0$ y $g(t_{k+1}) \le 0$ → raíz por Brent/bisección hasta 1 s.
3. $\Delta t_{restante} = T_{set} - t_0$. Si no hay cruce en la ventana de búsqueda (p. ej. 30 días) → `null` + `beyond_window = true`.

Contexto físico útil (sanity checks): en el polo exacto la elevación solar oscila ±1.54° (oblicuidad del ecuador lunar respecto a la eclíptica) a lo largo del año dracónico;
la elevación de la Tierra en el polo oscila ≈ ±6.7° (libración en latitud) con periodo de un mes dracónico (27.21 d); en la cara oculta (p. ej. Chang'e 4) la Tierra nunca es visible.

## 5. Energía Solar y Acimut (RF-05)

### 5.1 Irradiancia solar espacial AM0 ajustada por distancia heliocéntrica

La irradiancia solar en el espacio exterior (Air Mass Zero, AM0) a 1 UA se establece nominalmente en $S_0 = 1368.0\ \text{W/m}^2$. A la distancia heliocéntrica instantánea $d_{au}(t)$ (en unidades astronómicas, $\text{UA} = 149\,597\,870.7\text{ km}$), la irradiancia directa incidente considerando la fracción visible del disco solar $f(t) \in [0, 1]$ (§3.3) es:

$$
S(t) = \frac{S_0}{d_{au}(t)^2} \cdot f(t) \quad [\text{W/m}^2]
$$

Si el Sol está por debajo del horizonte matemático local ($e_\odot(t) \le 0$) o totalmente ocultado por el relieve ($f(t) = 0$), el flujo de radiación directa es nulo ($S(t) = 0$).

### 5.2 Modelado de las Tres Arquitecturas de Paneles Fotovoltaicos

Sea $e_\odot(t)$ la elevación solar aparente y $A_\odot(t)$ el acimut solar en el marco topocéntrico local. Para $e_\odot(t) > 0$:

1. **Panel Horizontal (`horizontal_panel`)**:
   El panel reposa plano sobre la superficie lunar ($\hat{\mathbf{n}} = \hat{\mathbf{u}}$). El ángulo de incidencia respecto a la normal es el ángulo cenital $z = 90^\circ - e_\odot$:

   $$
   P_{\text{horiz}}(t) = S(t) \cdot \sin e_\odot(t) \quad [\text{W/m}^2]
   $$

2. **Panel Vertical con Seguimiento en Acimut (`tracking_vertical_panel`)**:
   El panel se mantiene vertical y rota continuamente en acimut para encarar directamente al Sol ($A_{\text{panel}} = A_\odot(t)$). El ángulo de incidencia respecto a la normal del panel es exactamente la elevación solar $e_\odot$:

   $$
   P_{\text{track}}(t) = S(t) \cdot \cos e_\odot(t) \quad [\text{W/m}^2]
   $$

   > **Relevancia física polar:** En el polo sur lunar, la elevación solar es rasante ($e_\odot \in [-1.5^\circ, +1.5^\circ]$). Por tanto, $\sin e_\odot \approx 0.026$ mientras que $\cos e_\odot \approx 0.9997$. Esto implica que **un panel vertical genera hasta 40–50 veces más potencia que un panel horizontal**, justificando el diseño vertical de mástiles en misiones Artemis y rovers polares.

3. **Panel Vertical Fijo a Acimut $A_{\text{panel}}$ (`fixed_vertical_panel`)**:
   El panel se fija rígidamente en la superficie lunar encarando un acimut constante $A_{\text{panel}} \in [0^\circ, 360^\circ)$. El producto escalar entre la normal del panel y el vector solar introduce el factor coseno acimutal:

   $$
   P_{\text{fixed}}(t; A_{\text{panel}}) = S(t) \cdot \cos e_\odot(t) \cdot \max\big(0,\; \cos(A_\odot(t) - A_{\text{panel}})\big) \quad [\text{W/m}^2]
   $$

   Si el Sol incide por la parte posterior del panel ($\cos(A_\odot - A_{\text{panel}}) \le 0$), el panel no recibe radiación directa ($P = 0$).

### 5.3 Integración de Energía Acumulada

Para una serie temporal muestreada con paso temporal $\Delta t_{\text{hours}} = \frac{\Delta t_{\text{min}}}{60}$:

$$
E = \frac{\Delta t_{\text{hours}}}{1000} \sum_{k=1}^N P(t_k) \quad [\text{kWh/m}^2]
$$

El flujo medio se define como $\bar{P} = \frac{1}{N}\sum_{k=1}^N P(t_k)\ [\text{W/m}^2]$ y el flujo pico como $P_{\text{max}} = \max_k P(t_k)\ [\text{W/m}^2]$.

### 5.4 Buscador Automático del Acimut Óptimo de Aterrizaje

Para una ventana de misión dada, el algoritmo evalúa la energía acumulada generada por un panel vertical fijo sobre los 360 grados discretos de acimut $\psi \in \{0^\circ, 1^\circ, \dots, 359^\circ\}$:

$$
E(\psi) = \frac{\Delta t_{\text{hours}}}{1000} \sum_{k=1}^N \Big[ S(t_k) \cos e_\odot(t_k) \cdot \max\big(0,\; \cos(A_\odot(t_k) - \psi)\big) \Big] \quad [\text{kWh/m}^2]
$$

El **Acimut Óptimo de Orientación** y su **Energía Máxima** son:

$$
A_{\text{opt}} = \arg\max_{\psi \in [0^\circ, 359^\circ]} E(\psi), \qquad E_{\text{opt}} = \max_{\psi \in [0^\circ, 359^\circ]} E(\psi)
$$

Este cálculo tiene en cuenta intrínsecamente:
1. La trayectoria del acimut solar durante los días lunares de la misión.
2. Los macizos y montañas que bloquean el Sol en determinados acimuts (donde $f(t_k) = 0$).
3. Las variaciones de distancia Sol–Luna a lo largo de la órbita heliocéntrica.

## 6. Telecomunicaciones Direct-to-Earth (DTE) y Propagación en Espacio Libre

Para evaluar los presupuestos de enlace de radiocomunicaciones y los requerimientos del sistema de apuntamiento de antenas en la superficie lunar (exclusivo para Modo Ingeniero, RF-02, RF-05, RT-01), se aplican los siguientes modelos:

### 6.1 Margen Angular Topográfico (Terrain Clearance)

El margen angular instantáneo respecto al relieve local en la dirección del centro del disco terrestre es:

$$
\Delta \theta_{\text{clearance}}(t) = e_\oplus(t) - e_{\text{horiz}}(A_\oplus(t)) \quad [^\circ]
$$

Donde $e_\oplus(t)$ es la elevación topocéntrica aparente de la Tierra y $e_{\text{horiz}}(A_\oplus(t))$ es la elevación del horizonte topográfico calculada por raycasting LOLA (o esfera de referencia) en el acimut terrestre instantáneo $A_\oplus(t)$.
- $\Delta \theta_{\text{clearance}} \ge \delta_{\text{mask}}$: Enlace DTE activo con visión directa (LOS).
- $\Delta \theta_{\text{clearance}} < \delta_{\text{mask}}$: Enlace bloqueado por el relieve o por debajo de la máscara de elevación operacional.

Durante una ventana de misión se extraen el margen instantáneo $\Delta \theta(t_0)$, el margen mínimo $\min_k \Delta \theta(t_k)$ y el margen máximo $\max_k \Delta \theta(t_k)$.

### 6.2 Caja de Libración Terrestre y Rango Angular

Debido a la excentricidad orbital lunar y la inclinación del eje de rotación respecto a la eclíptica (libración en longitud $\pm 7.9^\circ$, en latitud $\pm 6.7^\circ$), la Tierra no permanece estacionaria en el cielo de un observador selenográfico, sino que describe un ciclo oscilatorio aparente de 27.21 días (mes dracónico / anomálico):

$$
\Delta A_\oplus = \max_k A_\oplus(t_k) - \min_k A_\oplus(t_k) \quad [^\circ]
$$
$$
\Delta e_\oplus = \max_k e_\oplus(t_k) - \min_k e_\oplus(t_k) \quad [^\circ]
$$

El rango total de variación angular aparente subtendido en la esfera celeste (para dimensionar el ancho de haz de media potencia HPBW de una antena fija o el rango de carrera de un gimbal de 2 ejes) se calcula como la distancia geodésica o hipotenusa proyectada:

$$
\theta_{\text{libration}} = \sqrt{(\Delta e_\oplus)^2 + \big(\Delta A_\oplus \cdot \cos\bar{e}_\oplus\big)^2} \quad [^\circ]
$$

Donde $\bar{e}_\oplus = \frac{1}{N}\sum_{k=1}^N e_\oplus(t_k)$ es la elevación media de la Tierra.

### 6.3 Retardo de Propagación de Señal (Light-Time)

Para una distancia topocéntrica instantánea o media Tierra–Luna $d_\oplus(t)$ [km] proporcionada por el kernel de efemérides DE421:

- **Tiempo de propagación en un sentido (One-Way Light Time, OWLT):**
  $$
  \tau_{\text{OWLT}} = \frac{d_\oplus}{c} \quad [\text{s}] \qquad (c = 299\,792.458\text{ km/s})
  $$
  Para $d_\oplus \in [363\,000, 405\,000]\text{ km}$, $\tau_{\text{OWLT}} \approx 1.21\text{ s} - 1.35\text{ s}$ ($\sim 1.282\text{ s}$ nominal).

- **Tiempo de retardo de ida y vuelta (Round-Trip Time, RTT):**
  $$
  \text{RTT} = 2 \cdot \tau_{\text{OWLT}} = \frac{2 d_\oplus}{c} \quad [\text{s}] \qquad (\sim 2.565\text{ s}\text{ nominal})
  $$

### 6.4 Pérdida de Propagación en el Espacio Libre (Free-Space Path Loss, FSPL)

De acuerdo con la norma ITU-R P.525-4 para un enlace de radiocomunicación espacial en campo lejano:

$$
\text{FSPL} = \left(\frac{4\pi d_\oplus}{\lambda}\right)^2 = \left(\frac{4\pi d_\oplus f}{c}\right)^2
$$

En escala logarítmica decibélica (dB), con distancia $d_{\text{km}}$ en kilómetros y frecuencia portadora $f_{\text{GHz}}$ en gigahercios:

$$
\text{FSPL}(\text{dB}) = 20 \log_{10}(d_{\text{km}}) + 20 \log_{10}(f_{\text{GHz}}) + 20 \log_{10}\left(\frac{4\pi \cdot 10^{12}}{c_{\text{m/s}}}\right)
$$
$$
\text{FSPL}(\text{dB}) = 20 \log_{10}(d_{\text{km}}) + 20 \log_{10}(f_{\text{GHz}}) + 92.45
$$

Frecuencias de enlace espacial lunar aplicadas:
1. **Banda S ($f = 2.2\text{ GHz}$):** Comunicaciones de telemetría de ingeniería, comando (TT&C) y enlaces EVA de astronautas:
   $$\text{FSPL}_S \approx 20 \log_{10}(384400) + 20 \log_{10}(2.2) + 92.45 \approx 211.0\text{ dB}$$
2. **Banda X ($f = 8.4\text{ GHz}$):** Enlace primario de ciencia y telemetría de alta tasa (ej. VIPER, CLPS landers, DSN Deep Space Network):
   $$\text{FSPL}_X \approx 20 \log_{10}(384400) + 20 \log_{10}(8.4) + 92.45 \approx 222.6\text{ dB}$$
3. **Banda Ka ($f = 32.0\text{ GHz}$):** Transmisión de retorno de banda ancha y vídeo ultra-HD para Artemis y cargas de alta capacidad:
   $$\text{FSPL}_{Ka} \approx 20 \log_{10}(384400) + 20 \log_{10}(32.0) + 92.45 \approx 234.3\text{ dB}$$

### 6.5 Métricas de Interrupción y Ventana Dorada (Simultaneidad Sol + DTE)

- **Duración máxima de corte de comunicaciones (`longest_comms_blackout_hours`):** Racha continua más prolongada con pérdida de línea de visión DTE ($\Delta \theta_{\text{clearance}} < \delta_{\text{mask}}$). Si es $0.0\text{ h}$, el enlace es 100% continuo e ininterrumpido.
- **Horas de Ventana Dorada (`simultaneous_sun_earth_hours`):** Suma neta de horas donde $f_{\text{sunlit}}(t) > 0$ (generación fotovoltaica activa) y $\Delta \theta_{\text{clearance}}(t) \ge \delta_{\text{mask}}$ (enlace de telemetría a Tierra directo disponible), maximizando las operaciones científicas y de telepresencia robótica.

## 7. Tolerancias de validación

| Magnitud | Referencia | Objetivo | Aceptación |
|----------|-----------|----------|-----------|
| Az/El geométrico Sol/Tierra | JPL Horizons (`coord@301`, AIRLESS) | ≤ 0.01° | ≤ 0.05° |
| Horizonte esfera lisa | Fórmulas §2.2 | ≤ 1e-9 rad | ≤ 1e-6 rad |
| Instante de evento | Muestreo fino (1 s) del mismo modelo | ≤ 1 s | ≤ 60 s |
| % iluminación polar | Mapas de iluminación publicados (Mazarico et al., 2011) | cualitativo ±5 % | cualitativo ±10 % |
