# MATH_MODELS — Physical and Mathematical Models

> **Owner:** `astro-terrain-specialist` · **QA Review:** `qa-verification-agent` · Requirements: RT-01, RT-02, RT-03
> Every equation here has an executable oracle in `backend/tests/oracles/horizon_oracle.py` or a validation plan against JPL Horizons.

## 0. Constants and Conventions

| Symbol | Value | Source / Note |
|--------|-------|---------------|
| $R$ (reference lunar radius) | 1 737 400 m (1737.4 km) | LOLA and IAU reference sphere |
| $R_\odot$ | 695 700 km | IAU 2015 Resolution B3 (nominal solar radius) |
| $R_\oplus$ | 6 378.137 km (equatorial) | WGS-84 / IAU; use equatorial radius for apparent disk |
| AU | 149 597 870.7 km | IAU 2012 |
| $c$ | 299 792.458 km/s | — |

- Latitude $\varphi$ and longitude $\lambda$ are **planetocentric**, **east-positive** longitude, **MOON_ME** (Mean Earth / Polar Axis) frame, the LOLA reference frame.
- Angles: degrees in the API; **radians** in the internal engine.
- Azimuth $A$: from local north, clockwise (N=0°, E=90°), in $[0°, 360°)$.
- Elevation $e$: angle above the local horizontal plane (perpendicular to the sphere normal).

## 1. Selenographic → Topocentric Transformation with Libration

### 1.1 Observer Position in the Body-Fixed Frame (MOON_ME)

$$
\mathbf{r}_{obs}^{ME} = (R + h)\begin{pmatrix}\cos\varphi\cos\lambda\\ \cos\varphi\sin\lambda\\ \sin\varphi\end{pmatrix},
\qquad h = h_{DEM}(\varphi,\lambda) + h_{mast}
$$

### 1.2 Libration

- **Physical libration:** the true orientation of the Moon is given by Euler angles $(\phi, \theta, \psi)(t)$ integrated in JPL ephemerides (binary kernel `moon_pa_de421_1900-2050.bpc` → **MOON_PA** frame).
- **MOON_ME** is obtained from MOON_PA via a **constant** rotation (frame kernel `moon_080317.tf` for DE421; `moon_de440_*.tf` for DE440). PA–ME offset ≈ 0.02°–0.03° (~ 800–900 m on the surface): **non-negligible** at the south pole.
- **Optical libration** (±7.9° in longitude, ±6.7° in latitude) is not modeled separately: it emerges automatically from the geometry because the Earth–Moon direction is expressed in the body-fixed frame at each instant.

Let $\mathbf{M}(t)$ be the ICRF → MOON_ME rotation matrix. Then:

$$
\mathbf{r}_{obs}^{ICRF}(t) = \mathbf{r}_{Moon}^{ICRF}(t) + \mathbf{M}(t)^{\mathsf T}\,\mathbf{r}_{obs}^{ME}
$$

### 1.3 Topocentric Vector to Body B (Sun or Earth)

With light-time correction $\tau$ (iterative, converges in 2–3 iterations):

$$
\boldsymbol{\rho}_B = \mathbf{r}_B^{ICRF}(t - \tau) - \mathbf{r}_{obs}^{ICRF}(t), \qquad \tau = \frac{|\boldsymbol{\rho}_B|}{c}
$$

Stellar aberration caused by the observer's velocity (~30 km/s relative to the solar system barycenter) shifts direction by ≈ 20.5″ (0.0057°). It is included
(Skyfield `.apparent()`) to match JPL Horizons' "apparent AIRLESS" observable.

### 1.4 Topocentric ENU Basis and Az/El

In MOON_ME (sphere ⇒ geodetic normal = geocentric):

$$
\hat{\mathbf u} = \begin{pmatrix}\cos\varphi\cos\lambda\\ \cos\varphi\sin\lambda\\ \sin\varphi\end{pmatrix},\quad
\hat{\mathbf e} = \begin{pmatrix}-\sin\lambda\\ \cos\lambda\\ 0\end{pmatrix},\quad
\hat{\mathbf n} = \begin{pmatrix}-\sin\varphi\cos\lambda\\ -\sin\varphi\sin\lambda\\ \cos\varphi\end{pmatrix}
$$

With $\hat{\boldsymbol\rho} = \mathbf{M}(t)\,\boldsymbol\rho_B / |\boldsymbol\rho_B|$ expressed in ME:

$$
e = \arcsin(\hat{\boldsymbol\rho}\cdot\hat{\mathbf u}), \qquad A = \operatorname{atan2}(\hat{\boldsymbol\rho}\cdot\hat{\mathbf e},\; \hat{\boldsymbol\rho}\cdot\hat{\mathbf n}) \bmod 360°
$$

**Polar singularity:** at exact $|\varphi| = 90°$, $\hat{\mathbf e}, \hat{\mathbf n}$ are undefined. Rule: if $|\varphi| > 89.9999°$, the user-supplied longitude fixes the reference meridian (documented in the response). Real sites (e.g., Shackleton, −89.68°) are unaffected.

### 1.5 Zero Atmospheric Refraction

The Moon is airless: $e_{apparent} = e_{geometric}$ (apart from light-time and aberration). It is **strictly forbidden** to apply any atmospheric refraction model
(Bennett, Saemundsson, etc.). In JPL Horizons use `APPARENT=AIRLESS`.

## 2. Airless Topographic Horizon (RT-02, RT-03)

### 2.1 Angular Elevation of a Terrain Point

Observer at radial distance $r_0 = R + h_0$ (includes mast). Terrain point $i$ at radial distance $r_i = R + h_i$ and
surface distance (great-circle arc) $d_i$, with central angle:

$$
\theta_i = \frac{d_i}{R}
$$

In the vertical plane containing the observer, the terrain point, and the lunar center, the observer→point vector is
$(r_i\sin\theta_i,\; r_i\cos\theta_i - r_0)$ in (horizontal, vertical) coordinates. Therefore:

$$
\boxed{\tan\gamma_i = \frac{r_i\cos\theta_i - r_0}{r_i\sin\theta_i}}
$$

**Numerically stable form** (avoids catastrophic cancellation as $\theta \to 0$), used in the implementation:

$$
r_i\cos\theta_i - r_0 = (h_i - h_0) - 2\,r_i\sin^2(\theta_i/2), \qquad
\gamma_i = \operatorname{atan2}\!\big((h_i - h_0) - 2 r_i \sin^2(\theta_i/2),\; r_i\sin\theta_i\big)
$$

### 2.2 Analytical Cases (Oracles)

1. **Smooth sphere, surface observer** ($h_i = h_0 = 0$): $\tan\gamma = -\tan(\theta/2) \Rightarrow \gamma = -\theta/2$.
2. **Geometric horizon dip** (observer at height $h_0$ above smooth sphere): maximum $\gamma$ on the surface occurs at the tangent point:

$$
\delta = \arccos\!\left(\frac{R}{R+h_0}\right) \approx \sqrt{2h_0/R}, \qquad d_{hor} = R\,\delta \approx \sqrt{2Rh_0}
$$

   Example: $h_0 = 2$ m ⇒ $\delta \approx 0.0869°$, $d_{hor} \approx 2.64$ km.
3. **Planar limit** ($R\to\infty$): $\gamma = \arctan\big((h_i-h_0)/d_i\big)$.
4. **Visibility of a peak of height $H$:** rises above the smooth-sphere horizon if $d < \sqrt{2Rh_0} + \sqrt{2RH}$ (≈ 134 km for $h_0=2$ m, $H=5$ km).

### 2.3 360° Horizon Profile

$$
\gamma_h(A) = \max_{i \in \text{ray}(A)} \gamma_i, \qquad A \in \{0, \Delta A, \dots, 360°-\Delta A\}
$$

- Ray = great circle from the observer at initial azimuth $A$ (spherical destination-point formula).
- Radial step $\Delta s \le$ DEM resolution (distance-adaptive stepping allowed: $\Delta s_j = \max(p,\, s_j\tan(\Delta A/2))$).
- Minimum range $L \ge 150$ km at the south pole (~5 km massifs remain visible at > 130 km, §2.2.4).
- $\gamma_h(A)$ is **linearly and circularly** interpolated in azimuth for the body's azimuth.
- If the ray leaves the DEM before $L$ → `truncated = true` in the response.

## 3. Sun and Earth Visibility Condition

### 3.1 Apparent Angular Radius

$$
\alpha_B = \arcsin\!\left(\frac{R_B}{|\boldsymbol\rho_B|}\right)
$$

- Sun: $\alpha_\odot \approx 0.2666°$ at 1 AU (0.2622°–0.2711° over the year).
- Earth: $\alpha_\oplus \approx 0.9507°$ at 384 400 km (≈ 0.90° at apogee, ≈ 1.02° at perigee).

### 3.2 States

With $\gamma_B = \gamma_h(A_B)$:

| State | Condition |
|-------|-----------|
| `visible` (full disk) | $e_B - \alpha_B > \gamma_B$ |
| `partial` | $\lvert e_B - \gamma_B \rvert \le \alpha_B$ |
| `occulted` | $e_B + \alpha_B < \gamma_B$ |

### 3.3 Visible Disk Fraction (locally straight horizon, uniform disk)

$$
x = \frac{\gamma_B - e_B}{\alpha_B}\in[-1,1], \qquad f = \frac{\arccos x - x\sqrt{1-x^2}}{\pi}
$$

($f=1$ if $x\le -1$; $f=0$ if $x\ge 1$.) Declared simplifications: horizon slope across the disk and limb darkening are neglected.

### 3.4 DTE Availability

$$
\text{DTE}(t) = \big[e_\oplus(t) - \gamma_\oplus(t) \ge m_{DTE}\big]
$$

with configurable elevation mask $m_{DTE}$ (default 0°, center of Earth's disk above the topographic horizon).

## 4. Events: Time Remaining Until Sunset and Earthset

Event functions (upper / lower limb clearance):

$$
g_{set}(t) = e_B(t) + \alpha_B(t) - \gamma_h(A_B(t)) \quad(\text{complete set: upper limb disappears})
$$
$$
g_{start}(t) = e_B(t) - \alpha_B(t) - \gamma_h(A_B(t)) \quad(\text{set onset: lower limb touches the horizon})
$$

Algorithm:
1. Sample $g$ on a coarse grid $\Delta t$ (10 min default; the Sun moves ≈ 0.508°/h in azimuth at the pole).
2. First interval with $g(t_k) > 0$ and $g(t_{k+1}) \le 0$ → root via Brent/bisection to 1 s.
3. $\Delta t_{remaining} = T_{set} - t_0$. If no crossing occurs within the search window (e.g., 30 days) → `null` + `beyond_window = true`.

Useful physical context (sanity checks): at the exact pole, solar elevation oscillates ±1.54° (obliquity of the lunar equator to the ecliptic) over the draconic year;
Earth elevation at the pole oscillates ≈ ±6.7° (libration in latitude) with a one-draconic-month period (27.21 d); on the far side (e.g., Chang'e 4), Earth is never visible.

## 5. Solar Energy and Azimuth (RF-05)

### 5.1 Space AM0 Solar Irradiance Adjusted for Heliocentric Distance

Air Mass Zero (AM0) solar irradiance at 1 AU is set nominally at $S_0 = 1368.0\ \text{W/m}^2$. At instantaneous heliocentric distance $d_{au}(t)$ (in astronomical units, $\text{AU} = 149\,597\,870.7\text{ km}$), direct incident irradiance accounting for the visible solar disk fraction $f(t) \in [0, 1]$ (§3.3) is:

$$
S(t) = \frac{S_0}{d_{au}(t)^2} \cdot f(t) \quad [\text{W/m}^2]
$$

If the Sun is below the local mathematical horizon ($e_\odot(t) \le 0$) or totally occulted by terrain ($f(t) = 0$), direct irradiance is zero ($S(t) = 0$).

### 5.2 Modeling the Three Photovoltaic Panel Architectures

Let $e_\odot(t)$ be apparent solar elevation and $A_\odot(t)$ solar azimuth in the local topocentric frame. For $e_\odot(t) > 0$:

1. **Horizontal Panel (`horizontal_panel`)**:
   The panel lies flat on the lunar surface ($\hat{\mathbf{n}} = \hat{\mathbf{u}}$). Incidence angle relative to the normal is zenith angle $z = 90^\circ - e_\odot$:

   $$
   P_{\text{horiz}}(t) = S(t) \cdot \sin e_\odot(t) \quad [\text{W/m}^2]
   $$

2. **Azimuth-Tracking Vertical Panel (`tracking_vertical_panel`)**:
   The panel stands vertically and continuously tracks azimuth to face the Sun directly ($A_{\text{panel}} = A_\odot(t)$). Incidence angle relative to the panel normal is exactly solar elevation $e_\odot$:

   $$
   P_{\text{track}}(t) = S(t) \cdot \cos e_\odot(t) \quad [\text{W/m}^2]
   $$

   > **Polar physical relevance:** At the lunar south pole, solar elevation is grazing ($e_\odot \in [-1.5^\circ, +1.5^\circ]$). Thus $\sin e_\odot \approx 0.026$ while $\cos e_\odot \approx 0.9997$. This means **a vertical panel generates up to 40–50 times more power than a horizontal panel**, explaining vertical solar arrays on Artemis habitats and polar rovers.

3. **Fixed Vertical Panel at Azimuth $A_{\text{panel}}$ (`fixed_vertical_panel`)**:
   The panel is rigidly mounted on the lunar surface facing constant azimuth $A_{\text{panel}} \in [0^\circ, 360^\circ)$. The dot product between panel normal and Sun vector introduces the azimuthal cosine factor:

   $$
   P_{\text{fixed}}(t; A_{\text{panel}}) = S(t) \cdot \cos e_\odot(t) \cdot \max\big(0,\; \cos(A_\odot(t) - A_{\text{panel}})\big) \quad [\text{W/m}^2]
   $$

   If sunlight strikes the back of the panel ($\cos(A_\odot - A_{\text{panel}}) \le 0$), direct power output is zero ($P = 0$).

### 5.3 Accumulated Energy Integration

For a time series sampled with time step $\Delta t_{\text{hours}} = \frac{\Delta t_{\text{min}}}{60}$:

$$
E = \frac{\Delta t_{\text{hours}}}{1000} \sum_{k=1}^N P(t_k) \quad [\text{kWh/m}^2]
$$

Mean flux is $\bar{P} = \frac{1}{N}\sum_{k=1}^N P(t_k)\ [\text{W/m}^2]$ and peak flux is $P_{\text{max}} = \max_k P(t_k)\ [\text{W/m}^2]$.

### 5.4 Automated Optimal Landing Azimuth Search

For a given mission window, the algorithm evaluates accumulated energy generated by a fixed vertical panel across all 360 discrete azimuth degrees $\psi \in \{0^\circ, 1^\circ, \dots, 359^\circ\}$:

$$
E(\psi) = \frac{\Delta t_{\text{hours}}}{1000} \sum_{k=1}^N \Big[ S(t_k) \cos e_\odot(t_k) \cdot \max\big(0,\; \cos(A_\odot(t_k) - \psi)\big) \Big] \quad [\text{kWh/m}^2]
$$

The **Optimal Orientation Azimuth** and its **Maximum Energy** are:

$$
A_{\text{opt}} = \arg\max_{\psi \in [0^\circ, 359^\circ]} E(\psi), \qquad E_{\text{opt}} = \max_{\psi \in [0^\circ, 359^\circ]} E(\psi)
$$

This calculation inherently captures:
1. The solar azimuth trajectory throughout the mission lunar days.
2. Massifs and crater rims blocking the Sun at certain azimuths (where $f(t_k) = 0$).
3. Sun–Moon distance variations along the heliocentric orbit.

## 6. Direct-to-Earth (DTE) Telecommunications and Free-Space Propagation

To evaluate radiocommunications link budgets and antenna pointing system requirements on the lunar surface (Engineer Mode only, RF-02, RF-05, RT-01), the following models apply:

### 6.1 Topographic Angular Margin (Terrain Clearance)

The instantaneous angular margin relative to local topography in the direction of the center of the Earth disk is:

$$
\Delta \theta_{\text{clearance}}(t) = e_\oplus(t) - e_{\text{horiz}}(A_\oplus(t)) \quad [^\circ]
$$

Where $e_\oplus(t)$ is the apparent topocentric elevation of the Earth and $e_{\text{horiz}}(A_\oplus(t))$ is the topographic horizon elevation computed by LOLA raycasting (or reference sphere) at the instantaneous Earth azimuth $A_\oplus(t)$.
- $\Delta \theta_{\text{clearance}} \ge \delta_{\text{mask}}$: Active DTE link with direct line-of-sight (LOS).
- $\Delta \theta_{\text{clearance}} < \delta_{\text{mask}}$: Link blocked by terrain or below the operational elevation mask.

Over a mission window, the instantaneous margin $\Delta \theta(t_0)$, minimum margin $\min_k \Delta \theta(t_k)$, and maximum margin $\max_k \Delta \theta(t_k)$ are extracted.

### 6.2 Earth Libration Box and Angular Range

Due to lunar orbital eccentricity and the inclination of the rotation axis relative to the ecliptic (libration in longitude $\pm 7.9^\circ$, in latitude $\pm 6.7^\circ$), the Earth does not remain stationary in the sky of a selenographic observer, instead tracing an apparent oscillatory cycle of 27.21 days (draconic / anomalistic month):

$$
\Delta A_\oplus = \max_k A_\oplus(t_k) - \min_k A_\oplus(t_k) \quad [^\circ]
$$
$$
\Delta e_\oplus = \max_k e_\oplus(t_k) - \min_k e_\oplus(t_k) \quad [^\circ]
$$

The total apparent angular variation range subtended on the celestial sphere (to size the half-power beamwidth HPBW of a fixed antenna or the travel range of a 2-axis gimbal) is computed as the projected geodesic distance or hypotenuse:

$$
\theta_{\text{libration}} = \sqrt{(\Delta e_\oplus)^2 + \big(\Delta A_\oplus \cdot \cos\bar{e}_\oplus\big)^2} \quad [^\circ]
$$

Where $\bar{e}_\oplus = \frac{1}{N}\sum_{k=1}^N e_\oplus(t_k)$ is the mean Earth elevation.

### 6.3 Signal Propagation Delay (Light-Time)

For an instantaneous or mean topocentric Earth–Moon distance $d_\oplus(t)$ [km] provided by the DE421 ephemeris kernel:

- **One-Way Light Time (OWLT):**
  $$
  \tau_{\text{OWLT}} = \frac{d_\oplus}{c} \quad [\text{s}] \qquad (c = 299\,792.458\text{ km/s})
  $$
  For $d_\oplus \in [363\,000, 405\,000]\text{ km}$, $\tau_{\text{OWLT}} \approx 1.21\text{ s} - 1.35\text{ s}$ ($\sim 1.282\text{ s}$ nominal).

- **Round-Trip Time (RTT):**
  $$
  \text{RTT} = 2 \cdot \tau_{\text{OWLT}} = \frac{2 d_\oplus}{c} \quad [\text{s}] \qquad (\sim 2.565\text{ s}\text{ nominal})
  $$

### 6.4 Free-Space Path Loss (FSPL)

According to ITU-R P.525-4 for a far-field space radiocommunication link:

$$
\text{FSPL} = \left(\frac{4\pi d_\oplus}{\lambda}\right)^2 = \left(\frac{4\pi d_\oplus f}{c}\right)^2
$$

In logarithmic decibel scale (dB), with distance $d_{\text{km}}$ in kilometers and carrier frequency $f_{\text{GHz}}$ in gigahertz:

$$
\text{FSPL}(\text{dB}) = 20 \log_{10}(d_{\text{km}}) + 20 \log_{10}(f_{\text{GHz}}) + 20 \log_{10}\left(\frac{4\pi \cdot 10^{12}}{c_{\text{m/s}}}\right)
$$
$$
\text{FSPL}(\text{dB}) = 20 \log_{10}(d_{\text{km}}) + 20 \log_{10}(f_{\text{GHz}}) + 92.45
$$

Applied lunar space link frequencies:
1. **S-Band ($f = 2.2\text{ GHz}$):** Engineering telemetry, commanding (TT&C), and astronaut EVA links:
   $$\text{FSPL}_S \approx 20 \log_{10}(384400) + 20 \log_{10}(2.2) + 92.45 \approx 211.0\text{ dB}$$
2. **X-Band ($f = 8.4\text{ GHz}$):** Primary science and high-rate telemetry link (e.g., VIPER, CLPS landers, Deep Space Network):
   $$\text{FSPL}_X \approx 20 \log_{10}(384400) + 20 \log_{10}(8.4) + 92.45 \approx 222.6\text{ dB}$$
3. **Ka-Band ($f = 32.0\text{ GHz}$):** Broadband return transmission and ultra-HD video for Artemis and high-capacity payloads:
   $$\text{FSPL}_{Ka} \approx 20 \log_{10}(384400) + 20 \log_{10}(32.0) + 92.45 \approx 234.3\text{ dB}$$

### 6.5 Blackout Metrics and Golden Window (Simultaneous Sun + DTE)

- **Longest communications blackout (`longest_comms_blackout_hours`):** Longest continuous streak with DTE line-of-sight loss ($\Delta \theta_{\text{clearance}} < \delta_{\text{mask}}$). If $0.0\text{ h}$, the link is 100% continuous and uninterrupted.
- **Golden Window Hours (`simultaneous_sun_earth_hours`):** Net sum of hours where $f_{\text{sunlit}}(t) > 0$ (active photovoltaic generation) and $\Delta \theta_{\text{clearance}}(t) \ge \delta_{\text{mask}}$ (direct Earth telemetry link available), maximizing science operations and robotic telepresence.

## 7. Validation Tolerances

| Quantity | Reference | Target | Acceptance |
|----------|-----------|--------|------------|
| Geometric Sun/Earth Az/El | JPL Horizons (`coord@301`, AIRLESS) | ≤ 0.01° | ≤ 0.05° |
| Smooth sphere horizon | Formulas §2.2 | ≤ 1e-9 rad | ≤ 1e-6 rad |
| Event timestamp | Fine sampling (1 s) of same model | ≤ 1 s | ≤ 60 s |
| % polar illumination | Published illumination maps (Mazarico et al., 2011) | qualitative ±5 % | qualitative ±10 % |
