import urllib.request
import re

url = "https://svs.gsfc.nasa.gov/4720/"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
        matches = re.findall(r'href=["\']([^"\']+\.(?:jpg|png|tif|tiff))["\']', html, re.I)
        print("Total image links found on SVS 4720:", len(matches))
        for m in sorted(set(matches)):
            m_lower = m.lower()
            if any(k in m_lower for k in ["2k", "1k", "bump", "disp", "lroc", "ldim", "color", "moon"]):
                print(" ", m)
except Exception as e:
    print("Failed:", e)
