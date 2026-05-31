import requests
import yfinance as yf
import time
import xml.etree.ElementTree as ET

_cache = {}
CACHE_TTL    = 60      # 주식/코인 캐시 (초)
REALESTATE_TTL = 86400  # 부동산 캐시 24시간

MOLIT_API_KEY = "ba19b002ca5e980751490c720fb2751f1704546745494e10b9796164290c9ba1"
MOLIT_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"


def _cached(key, fn, ttl=None):
    if ttl is None:
        ttl = CACHE_TTL
    now = time.time()
    if key in _cache and now - _cache[key]["ts"] < ttl:
        return _cache[key]["val"]
    val = fn()
    if val is not None:
        _cache[key] = {"val": val, "ts": now}
    return val


def get_usd_krw():
    def fetch():
        try:
            ticker = yf.Ticker("USDKRW=X")
            hist = ticker.history(period="2d")
            if not hist.empty:
                return float(hist["Close"].iloc[-1])
        except Exception:
            pass
        try:
            r = requests.get(
                "https://api.exchangerate-api.com/v4/latest/USD", timeout=5
            )
            return r.json()["rates"]["KRW"]
        except Exception:
            return 1380.0

    return _cached("usd_krw", fetch)


def get_kr_stock_price(ticker):
    """한국 주식 현재가 (KRW). ticker: 6자리 숫자 코드"""
    def fetch():
        try:
            # yfinance KS/KQ 시도
            for suffix in [".KS", ".KQ"]:
                t = yf.Ticker(ticker + suffix)
                hist = t.history(period="2d")
                if not hist.empty:
                    return float(hist["Close"].iloc[-1])
        except Exception:
            pass
        try:
            # Naver Finance fallback
            url = f"https://m.stock.naver.com/api/stock/{ticker}/basic"
            r = requests.get(url, timeout=5, headers={"User-Agent": "Mozilla/5.0"})
            data = r.json()
            return float(data.get("closePrice", "0").replace(",", ""))
        except Exception:
            return None

    return _cached(f"kr_{ticker}", fetch)


def get_us_stock_price(ticker):
    """미국 주식 현재가 (USD)"""
    def fetch():
        try:
            t = yf.Ticker(ticker)
            hist = t.history(period="2d")
            if not hist.empty:
                return float(hist["Close"].iloc[-1])
        except Exception:
            return None

    return _cached(f"us_{ticker}", fetch)


def get_upbit_price(symbol):
    """업비트 KRW 마켓 현재가. symbol: BTC, ETH, ..."""
    def fetch():
        try:
            market = f"KRW-{symbol.upper()}"
            r = requests.get(
                f"https://api.upbit.com/v1/ticker?markets={market}", timeout=5
            )
            data = r.json()
            if data and isinstance(data, list):
                return float(data[0]["trade_price"])
        except Exception:
            return None

    return _cached(f"upbit_{symbol}", fetch)


def get_binance_price_usd(symbol):
    """바이낸스 USDT 마켓 현재가 (USD). symbol: BTC, ETH, ..."""
    def fetch():
        try:
            pair = f"{symbol.upper()}USDT"
            r = requests.get(
                f"https://api.binance.com/api/v3/ticker/price?symbol={pair}",
                timeout=5,
            )
            return float(r.json()["price"])
        except Exception:
            return None

    return _cached(f"binance_{symbol}", fetch)


def get_realestate_price(apt_name, lawd_cd="11230", area=None):
    """국토교통부 실거래가 API — 아파트 최근 거래가 (만원 단위 → 원 반환)
    apt_name: 아파트명 (부분 일치), lawd_cd: 시군구코드 5자리, area: 전용면적(㎡, 오차 ±3 허용)
    """
    from datetime import datetime, timedelta

    cache_key = f"realestate_{apt_name}_{lawd_cd}_{area}"

    def fetch():
        now = datetime.now()
        for i in range(12):  # 최대 12개월 전까지 탐색
            ym = (now - timedelta(days=30 * i)).strftime("%Y%m")
            try:
                r = requests.get(MOLIT_URL, params={
                    "serviceKey": MOLIT_API_KEY,
                    "LAWD_CD":    lawd_cd,
                    "DEAL_YMD":   ym,
                    "numOfRows":  "200",
                    "pageNo":     "1",
                }, timeout=10)
                if r.status_code != 200:
                    continue
                root = ET.fromstring(r.content)
                candidates = []
                for item in root.findall(".//item"):
                    name = item.findtext("aptNm", "").strip()
                    if apt_name not in name and name not in apt_name:
                        continue
                    price_str = item.findtext("dealAmount", "0").replace(",", "").strip()
                    if not price_str.isdigit():
                        continue
                    item_area = float(item.findtext("excluUseAr", "0") or 0)
                    if area and abs(item_area - float(area)) > 3:
                        continue
                    deal_date = (
                        f"{item.findtext('dealYear','')}."
                        f"{item.findtext('dealMonth','').zfill(2)}."
                        f"{item.findtext('dealDay','').zfill(2)}"
                    )
                    candidates.append({
                        "price_krw": int(price_str) * 10_000,
                        "area":  item_area,
                        "floor": item.findtext("floor", ""),
                        "date":  deal_date,
                        "name":  name,
                    })
                if candidates:
                    candidates.sort(key=lambda x: x["date"], reverse=True)
                    return candidates[0]  # 가장 최근 거래
            except Exception:
                continue
        return None

    return _cached(cache_key, fetch, ttl=REALESTATE_TTL)


def get_asset_current_value(asset):
    """자산 딕셔너리를 받아 현재가(KRW)와 현재평가액(KRW) 반환"""
    category = asset.get("category", "")
    ticker = asset.get("ticker", "")
    quantity = float(asset.get("quantity") or 0)
    purchase_amount = float(asset.get("purchase_amount") or 0)

    current_price_krw = None
    current_price_display = None
    current_value = None

    try:
        if category == "bank" or category == "severance":
            # 고정자산: purchase_amount가 현재가치
            current_value = purchase_amount
            current_price_krw = purchase_amount

        elif category == "real_estate":
            if ticker:
                # 티커에 아파트명 입력 시 실거래가 API 조회
                lawd_cd = asset.get("notes", "").strip() if len(asset.get("notes","").strip()) == 5 and asset.get("notes","").strip().isdigit() else "11230"
                result = get_realestate_price(ticker, lawd_cd=lawd_cd, area=quantity if quantity else None)
                if result:
                    current_price_krw = result["price_krw"]
                    current_price_display = result["price_krw"]
                    current_value = result["price_krw"]
                else:
                    current_value = purchase_amount
            else:
                current_value = purchase_amount
                current_price_krw = purchase_amount

        elif category in ("domestic_stock", "pension"):
            if ticker:
                price = get_kr_stock_price(ticker)
                if price:
                    current_price_krw = price
                    current_price_display = price
                    current_value = price * quantity if quantity else purchase_amount
            else:
                current_value = purchase_amount

        elif category == "us_stock":
            if ticker:
                price_usd = get_us_stock_price(ticker)
                usd_krw = get_usd_krw()
                if price_usd and usd_krw:
                    current_price_krw = price_usd * usd_krw
                    current_price_display = price_usd
                    current_value = current_price_krw * quantity if quantity else purchase_amount
            else:
                current_value = purchase_amount

        elif category == "coin_upbit":
            if ticker:
                price = get_upbit_price(ticker)
                if price:
                    current_price_krw = price
                    current_price_display = price
                    current_value = price * quantity if quantity else purchase_amount
            else:
                current_value = purchase_amount

        elif category == "coin_binance":
            if ticker:
                price_usd = get_binance_price_usd(ticker)
                usd_krw = get_usd_krw()
                if price_usd and usd_krw:
                    current_price_krw = price_usd * usd_krw
                    current_price_display = price_usd
                    current_value = current_price_krw * quantity if quantity else purchase_amount
            else:
                current_value = purchase_amount

    except Exception:
        current_value = purchase_amount

    if current_value is None:
        current_value = purchase_amount

    profit_loss = current_value - purchase_amount if purchase_amount else 0
    profit_rate = (profit_loss / purchase_amount * 100) if purchase_amount else 0

    return {
        "current_price_krw": round(current_price_krw) if current_price_krw else None,
        "current_price_display": current_price_display,
        "current_value": round(current_value),
        "profit_loss": round(profit_loss),
        "profit_rate": round(profit_rate, 2),
    }
