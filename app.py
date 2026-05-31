import os
from flask import Flask, render_template, jsonify, request
import json
from datetime import datetime

from database import init_db, get_db
from price_fetcher import get_asset_current_value, get_usd_krw, get_realestate_history
from loan_calculator import (
    full_loan_info,
    equal_principal_schedule,
    calc_remaining_at_change,
    get_next_payment_date,
    segment_info,
)

app = Flask(__name__)
init_db()

CATEGORY_LABELS = {
    "bank":           "은행 예금/적금",
    "domestic_stock": "국내주식",
    "pension":        "연금",
    "us_stock":       "미국주식",
    "coin_upbit":     "업비트 코인",
    "coin_binance":   "바이낸스 코인",
    "real_estate":    "부동산",
    "severance":      "퇴직금",
}

SUBCATEGORY_LABELS = {
    "savings":        "예금",
    "installment":    "적금",
    "regular":        "일반 주식계좌",
    "isa":            "ISA",
    "pension_savings":"연금저축",
    "irp":            "IRP",
    "spot":           "현물",
    "staking":        "스테이킹",
}


# ── 메인 ─────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


# ── 자산 ─────────────────────────────────────────────────────
@app.route("/api/assets", methods=["GET"])
def get_assets():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM assets ORDER BY category, subcategory, name"
    ).fetchall()
    conn.close()

    assets = []
    for row in rows:
        asset = dict(row)
        prices = get_asset_current_value(asset)
        asset.update(prices)
        asset["category_label"]    = CATEGORY_LABELS.get(asset["category"], asset["category"])
        asset["subcategory_label"] = SUBCATEGORY_LABELS.get(asset["subcategory"], asset["subcategory"])
        assets.append(asset)
    return jsonify(assets)


@app.route("/api/assets", methods=["POST"])
def add_asset():
    d = request.json
    conn = get_db()
    conn.execute(
        """INSERT INTO assets
           (category, subcategory, name, ticker, quantity, avg_price,
            purchase_amount, currency, is_staking, notes)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (d.get("category","bank"), d.get("subcategory",""),
         d.get("name",""), d.get("ticker",""),
         float(d.get("quantity") or 0), float(d.get("avg_price") or 0),
         float(d.get("purchase_amount") or 0),
         d.get("currency","KRW"), int(d.get("is_staking",0)), d.get("notes","")),
    )
    conn.commit(); conn.close()
    return jsonify({"ok": True})


@app.route("/api/assets/<int:asset_id>", methods=["PUT"])
def update_asset(asset_id):
    d = request.json
    conn = get_db()
    conn.execute(
        """UPDATE assets SET
           category=?, subcategory=?, name=?, ticker=?, quantity=?, avg_price=?,
           purchase_amount=?, currency=?, is_staking=?, notes=?,
           updated_at=datetime('now','localtime')
           WHERE id=?""",
        (d.get("category"), d.get("subcategory",""), d.get("name"),
         d.get("ticker",""), float(d.get("quantity") or 0),
         float(d.get("avg_price") or 0), float(d.get("purchase_amount") or 0),
         d.get("currency","KRW"), int(d.get("is_staking",0)),
         d.get("notes",""), asset_id),
    )
    conn.commit(); conn.close()
    return jsonify({"ok": True})


@app.route("/api/assets/<int:asset_id>", methods=["DELETE"])
def delete_asset(asset_id):
    conn = get_db()
    conn.execute("DELETE FROM assets WHERE id=?", (asset_id,))
    conn.commit(); conn.close()
    return jsonify({"ok": True})


# ── 요약 ─────────────────────────────────────────────────────
@app.route("/api/summary")
def summary():
    conn     = get_db()
    rows     = conn.execute("SELECT * FROM assets").fetchall()
    loans    = conn.execute("SELECT * FROM loans").fetchall()
    segments = conn.execute("SELECT * FROM loan_rate_segments").fetchall()
    conn.close()

    cat_totals   = {}
    total_assets = 0
    for row in rows:
        asset = dict(row)
        val   = get_asset_current_value(asset)["current_value"]
        total_assets += val
        cat = asset["category"]
        cat_totals[cat] = cat_totals.get(cat, 0) + val

    total_liab = 0
    seg_by_loan = {}
    for s in segments:
        seg_by_loan.setdefault(s["loan_id"], []).append(dict(s))

    for loan in loans:
        loan = dict(loan)
        if loan["repayment_type"] == "equal_payment":
            segs = seg_by_loan.get(loan["id"], [])
            info = full_loan_info(loan, segs) if segs else {}
        else:
            info = equal_principal_schedule(
                loan["original_principal"], loan["annual_rate"],
                loan["term_months"], loan["payments_made"])
        total_liab += info.get("remaining_principal", 0)

    return jsonify({
        "total_assets":      round(total_assets),
        "total_liabilities": round(total_liab),
        "net_worth":         round(total_assets - total_liab),
        "usd_krw":           round(get_usd_krw(), 2),
        "updated_at":        datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "category_totals":   {k: round(v) for k, v in cat_totals.items()},
        "category_labels":   CATEGORY_LABELS,
    })


# ── 대출 ─────────────────────────────────────────────────────
@app.route("/api/loans")
def get_loans():
    conn     = get_db()
    loans    = [dict(r) for r in conn.execute("SELECT * FROM loans").fetchall()]
    seg_rows = conn.execute("SELECT * FROM loan_rate_segments ORDER BY from_payment").fetchall()
    conn.close()

    seg_by_loan = {}
    for s in seg_rows:
        seg_by_loan.setdefault(s["loan_id"], []).append(dict(s))

    result = []
    for loan in loans:
        if loan["repayment_type"] == "equal_payment":
            segs = seg_by_loan.get(loan["id"], [])
            info = full_loan_info(loan, segs) if segs else {}
        else:
            info = equal_principal_schedule(
                loan["original_principal"], loan["annual_rate"],
                loan["term_months"], loan["payments_made"])

        info["next_payment_date"] = get_next_payment_date(
            loan["start_date"], loan["payment_day"], loan["payments_made"])
        loan.update(info)
        result.append(loan)

    return jsonify(result)


@app.route("/api/loans/<int:loan_id>", methods=["PUT"])
def update_loan(loan_id):
    d = request.json
    conn = get_db()
    conn.execute(
        "UPDATE loans SET name=?, payments_made=?, notes=? WHERE id=?",
        (d["name"], int(d["payments_made"]), d.get("notes",""), loan_id),
    )
    conn.commit(); conn.close()
    return jsonify({"ok": True})


# ── 금리 변경 ─────────────────────────────────────────────────
@app.route("/api/loans/<int:loan_id>/rate-change", methods=["POST"])
def apply_rate_change(loan_id):
    """
    body: { "annual_rate": 4.5 }
    - 현재 payments_made 기준 잔여 원금 계산
    - 기존 현재 구간을 close (to_payment = payments_made)
    - 새 구간 추가 (from_payment = payments_made, 새 금리)
    - loans 테이블의 annual_rate 업데이트
    """
    d = request.json
    new_rate = float(d["annual_rate"])

    conn = get_db()
    loan = dict(conn.execute("SELECT * FROM loans WHERE id=?", (loan_id,)).fetchone())

    if loan["repayment_type"] != "equal_payment":
        conn.close()
        return jsonify({"ok": False, "error": "원금균등상환 대출은 금리 변경 구간을 지원하지 않습니다."}), 400

    segs = [dict(r) for r in conn.execute(
        "SELECT * FROM loan_rate_segments WHERE loan_id=? ORDER BY from_payment",
        (loan_id,)
    ).fetchall()]

    payments_now = loan["payments_made"]
    remaining    = calc_remaining_at_change(segs, payments_now)
    term_left    = loan["term_months"] - payments_now

    # 현재 구간 close
    conn.execute(
        "UPDATE loan_rate_segments SET to_payment=? WHERE loan_id=? AND to_payment IS NULL",
        (payments_now, loan_id),
    )

    # 새 구간 추가
    conn.execute(
        """INSERT INTO loan_rate_segments
           (loan_id, annual_rate, from_payment, to_payment,
            principal_at_start, term_from_start)
           VALUES (?,?,?,?,?,?)""",
        (loan_id, new_rate, payments_now, None, remaining, term_left),
    )

    # loans 테이블 금리 업데이트
    conn.execute("UPDATE loans SET annual_rate=? WHERE id=?", (new_rate, loan_id))

    conn.commit()

    # 새 월납부액 미리 계산해서 반환
    info = segment_info(remaining, new_rate, term_left, 0)
    conn.close()

    return jsonify({
        "ok": True,
        "new_monthly_payment":   info["monthly_payment"],
        "remaining_principal":   round(remaining),
        "term_left":             term_left,
    })


# ── 금리 변경 미리보기 ─────────────────────────────────────────
@app.route("/api/loans/<int:loan_id>/rate-preview", methods=["POST"])
def preview_rate_change(loan_id):
    """새 금리 입력 시 새 월납부액 즉시 계산 (저장 없음)"""
    d = request.json
    new_rate = float(d["annual_rate"])

    conn = get_db()
    loan = dict(conn.execute("SELECT * FROM loans WHERE id=?", (loan_id,)).fetchone())
    segs = [dict(r) for r in conn.execute(
        "SELECT * FROM loan_rate_segments WHERE loan_id=? ORDER BY from_payment",
        (loan_id,)
    ).fetchall()]
    conn.close()

    payments_now = loan["payments_made"]
    remaining    = calc_remaining_at_change(segs, payments_now)
    term_left    = loan["term_months"] - payments_now

    info = segment_info(remaining, new_rate, term_left, 0)

    current_segs = sorted(segs, key=lambda s: s["from_payment"])
    current_seg  = next(s for s in current_segs if s["to_payment"] is None)
    current_info = segment_info(
        current_seg["principal_at_start"],
        current_seg["annual_rate"],
        current_seg["term_from_start"],
        payments_now - current_seg["from_payment"],
    )

    return jsonify({
        "remaining_principal":   round(remaining),
        "term_left":             term_left,
        "old_monthly_payment":   current_info["monthly_payment"],
        "new_monthly_payment":   info["monthly_payment"],
        "monthly_diff":          info["monthly_payment"] - current_info["monthly_payment"],
    })


# ── 부동산 실거래가 이력 ──────────────────────────────────────
@app.route("/api/realestate/history")
def realestate_history():
    """부동산 자산의 실거래가 이력 반환"""
    conn = get_db()
    re_assets = conn.execute(
        "SELECT * FROM assets WHERE category='real_estate' AND ticker != ''"
    ).fetchall()
    conn.close()

    result = []
    for asset in re_assets:
        asset = dict(asset)
        ticker   = asset["ticker"]
        notes    = asset.get("notes", "").strip()
        lawd_cd  = notes if len(notes) == 5 and notes.isdigit() else "11230"
        history  = get_realestate_history(ticker, lawd_cd=lawd_cd)
        result.append({
            "asset_id":   asset["id"],
            "asset_name": asset["name"],
            "apt_name":   ticker,
            "lawd_cd":    lawd_cd,
            "history":    history,
        })

    return jsonify(result)


# ── 연금 원금 납입 관리 ──────────────────────────────────────
PENSION_ACCOUNT_LABELS = {
    "pension_savings":  "연금저축",
    "irp":              "IRP",
    "personal_company": "개인연금(회사)",
}

PENSION_ANNUAL_TARGETS = {
    "pension_savings": 2_640_000,
    "irp":             3_000_000,
    "personal_company": None,
}

# 연금 계좌 타입 → assets 테이블 subcategory 매핑
PENSION_ASSET_SUBCAT = {
    "pension_savings": "pension_savings",
    "irp":             "irp",
    "personal_company": None,  # 별도 자산 없음
}


@app.route("/api/pension/contributions", methods=["GET"])
def get_pension_contributions():
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM pension_contributions ORDER BY contributed_date DESC, id DESC"
    ).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])


@app.route("/api/pension/contributions", methods=["POST"])
def add_pension_contribution():
    d = request.json
    conn = get_db()
    conn.execute(
        """INSERT INTO pension_contributions
           (account_type, amount, contributed_date, memo)
           VALUES (?,?,?,?)""",
        (d["account_type"], float(d["amount"]),
         d["contributed_date"], d.get("memo", "")),
    )
    conn.commit(); conn.close()
    return jsonify({"ok": True})


@app.route("/api/pension/contributions/<int:cid>", methods=["DELETE"])
def delete_pension_contribution(cid):
    conn = get_db()
    conn.execute("DELETE FROM pension_contributions WHERE id=?", (cid,))
    conn.commit(); conn.close()
    return jsonify({"ok": True})


@app.route("/api/pension/personal-company-value", methods=["GET"])
def get_pc_value():
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key='pension_pc_value'").fetchone()
    conn.close()
    return jsonify({"value": float(row["value"]) if row else 0})


@app.route("/api/pension/personal-company-value", methods=["PUT"])
def set_pc_value():
    v = float(request.json.get("value", 0))
    conn = get_db()
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('pension_pc_value', ?)", (str(v),)
    )
    conn.commit(); conn.close()
    return jsonify({"ok": True})


@app.route("/api/pension/summary")
def pension_summary():
    """계좌별 누적원금, 현재 평가액, 순수익률 요약"""
    conn = get_db()
    contribs = conn.execute("SELECT * FROM pension_contributions").fetchall()
    assets   = conn.execute(
        "SELECT * FROM assets WHERE category='pension'"
    ).fetchall()
    pc_row   = conn.execute("SELECT value FROM settings WHERE key='pension_pc_value'").fetchone()
    conn.close()
    pc_value = float(pc_row["value"]) if pc_row else 0

    # 계좌별 누적 원금
    cumulative = {}
    for r in contribs:
        at = r["account_type"]
        cumulative[at] = cumulative.get(at, 0) + r["amount"]

    # 계좌별 현재 평가액 (assets 테이블 기준 + personal_company 수동값)
    current_values = {"personal_company": pc_value}
    for row in assets:
        asset = dict(row)
        val   = get_asset_current_value(asset)["current_value"]
        subcat = asset["subcategory"]
        for atype, sc in PENSION_ASSET_SUBCAT.items():
            if sc == subcat:
                current_values[atype] = current_values.get(atype, 0) + val

    # 올해 납입액 (연간 세액공제 진행률)
    import datetime
    year = datetime.date.today().year
    year_contrib = {}
    for r in contribs:
        if r["contributed_date"][:4] == str(year):
            at = r["account_type"]
            year_contrib[at] = year_contrib.get(at, 0) + r["amount"]

    result = {}
    for atype, label in PENSION_ACCOUNT_LABELS.items():
        cum = cumulative.get(atype, 0)
        cur = current_values.get(atype, 0)
        profit = cur - cum
        rate   = (profit / cum * 100) if cum > 0 else 0
        annual_target = PENSION_ANNUAL_TARGETS[atype]
        result[atype] = {
            "label":          label,
            "cumulative":     round(cum),
            "current_value":  round(cur),
            "profit":         round(profit),
            "profit_rate":    round(rate, 2),
            "year_contrib":   round(year_contrib.get(atype, 0)),
            "annual_target":  annual_target,
        }

    # 자산현황 탭용 합계
    total_cumulative    = sum(cumulative.get(a, 0) for a in PENSION_ACCOUNT_LABELS)
    total_current_value = sum(current_values.get(a, 0) for a in PENSION_ACCOUNT_LABELS)
    result["_totals"] = {
        "cumulative":    round(total_cumulative),
        "current_value": round(total_current_value),
    }

    return jsonify(result)


# ── 스냅샷 ────────────────────────────────────────────────────
@app.route("/api/snapshot", methods=["POST"])
def take_snapshot():
    d = request.json or {}

    conn     = get_db()
    rows     = conn.execute("SELECT * FROM assets").fetchall()
    loans    = [dict(r) for r in conn.execute("SELECT * FROM loans").fetchall()]
    seg_rows = conn.execute("SELECT * FROM loan_rate_segments").fetchall()

    cat_totals   = {}
    total_assets = 0
    for row in rows:
        asset = dict(row)
        val   = get_asset_current_value(asset)["current_value"]
        total_assets += val
        cat = asset["category"]
        cat_totals[cat] = cat_totals.get(cat, 0) + val

    seg_by_loan = {}
    for s in seg_rows:
        seg_by_loan.setdefault(s["loan_id"], []).append(dict(s))

    total_liab = 0
    for loan in loans:
        if loan["repayment_type"] == "equal_payment":
            segs = seg_by_loan.get(loan["id"], [])
            info = full_loan_info(loan, segs) if segs else {}
        else:
            info = equal_principal_schedule(
                loan["original_principal"], loan["annual_rate"],
                loan["term_months"], loan["payments_made"])
        total_liab += info.get("remaining_principal", 0)

    net = total_assets - total_liab
    conn.execute(
        """INSERT INTO snapshots
           (snapshot_date, total_assets, total_liabilities, net_worth, breakdown, memo)
           VALUES (?,?,?,?,?,?)""",
        (d.get("date", datetime.now().strftime("%Y-%m-%d")),
         round(total_assets), round(total_liab), round(net),
         json.dumps(cat_totals, ensure_ascii=False), d.get("memo","")),
    )
    conn.commit(); conn.close()

    return jsonify({"ok": True, "net_worth": round(net)})


@app.route("/api/history")
def get_history():
    conn  = get_db()
    rows  = conn.execute("SELECT * FROM snapshots ORDER BY snapshot_date ASC").fetchall()
    conn.close()
    result = []
    for row in rows:
        s = dict(row)
        try:    s["breakdown"] = json.loads(s["breakdown"])
        except: s["breakdown"] = {}
        result.append(s)
    return jsonify(result)


@app.route("/api/history/<int:snap_id>", methods=["DELETE"])
def delete_snapshot(snap_id):
    conn = get_db()
    conn.execute("DELETE FROM snapshots WHERE id=?", (snap_id,))
    conn.commit(); conn.close()
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(debug=False, host="0.0.0.0", port=port)
