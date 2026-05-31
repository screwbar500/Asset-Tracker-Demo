from datetime import datetime
from dateutil.relativedelta import relativedelta


# ── 기본 계산 (단일 금리 구간) ────────────────────────────────
def _monthly_payment(principal, annual_rate, term_months):
    r = annual_rate / 12 / 100
    n = term_months
    if r == 0:
        return principal / n
    return principal * r * (1 + r) ** n / ((1 + r) ** n - 1)


def _remaining_principal(principal, annual_rate, term_months, k):
    """원리금균등상환: k회 납부 후 잔여 원금"""
    r = annual_rate / 12 / 100
    n = term_months
    if r == 0:
        return principal - k * (principal / n)
    mp = _monthly_payment(principal, annual_rate, n)
    return principal * (1 + r) ** k - mp * ((1 + r) ** k - 1) / r


def segment_info(principal_at_start, annual_rate, term_from_start, payments_in_segment):
    """한 금리 구간의 현재 상태 계산"""
    r   = annual_rate / 12 / 100
    n   = term_from_start
    k   = payments_in_segment
    mp  = _monthly_payment(principal_at_start, annual_rate, n)
    rem = _remaining_principal(principal_at_start, annual_rate, n, k)
    interest_in_segment = k * mp - (principal_at_start - rem)

    return {
        "monthly_payment":      round(mp),
        "remaining_principal":  round(rem),
        "next_interest":        round(rem * r),
        "next_principal":       round(mp - rem * r),
        "interest_in_segment":  round(interest_in_segment),
    }


# ── 전체 대출 정보 (다중 금리 구간 지원) ──────────────────────
def full_loan_info(loan, segments):
    """
    loan     : loans 테이블 row (dict)
    segments : loan_rate_segments 테이블의 해당 대출 전체 구간 list
               각 구간: {id, annual_rate, from_payment, to_payment,
                         principal_at_start, term_from_start}
    """
    segments = sorted(segments, key=lambda s: s["from_payment"])
    current  = next(s for s in segments if s["to_payment"] is None)

    total_payments   = loan["payments_made"]
    segment_payments = total_payments - current["from_payment"]

    info = segment_info(
        current["principal_at_start"],
        current["annual_rate"],
        current["term_from_start"],
        segment_payments,
    )

    # 전체 납부 이자 합산
    total_interest = 0
    for seg in segments:
        k = (seg["to_payment"] - seg["from_payment"]
             if seg["to_payment"] is not None
             else segment_payments)
        mp  = _monthly_payment(seg["principal_at_start"], seg["annual_rate"], seg["term_from_start"])
        rem = _remaining_principal(seg["principal_at_start"], seg["annual_rate"], seg["term_from_start"], k)
        total_interest += k * mp - (seg["principal_at_start"] - rem)

    principal_paid = loan["original_principal"] - info["remaining_principal"]

    info["payments_made"]         = total_payments
    info["payments_left"]         = loan["term_months"] - total_payments
    info["interest_paid_so_far"]  = round(total_interest)
    info["principal_paid_so_far"] = round(principal_paid)
    info["current_annual_rate"]   = current["annual_rate"]
    info["rate_history"]         = [
        {
            "annual_rate":        s["annual_rate"],
            "from_payment":       s["from_payment"],
            "to_payment":         s["to_payment"],
            "principal_at_start": round(s["principal_at_start"]),
            "term_from_start":    s["term_from_start"],
        }
        for s in segments
    ]
    return info


# ── 원금균등상환 (회사대출) ────────────────────────────────────
def equal_principal_schedule(principal, annual_rate, total_months, payments_made):
    r = annual_rate / 12 / 100
    monthly_principal = principal / total_months
    k = payments_made
    remaining = principal - k * monthly_principal

    total_interest = 0
    for i in range(k):
        bal = principal - i * monthly_principal
        total_interest += bal * r

    next_interest = remaining * r
    return {
        "monthly_payment":        round(monthly_principal + next_interest),
        "monthly_principal":      round(monthly_principal),
        "remaining_principal":    round(remaining),
        "payments_made":          k,
        "payments_left":          total_months - k,
        "next_principal":         round(monthly_principal),
        "next_interest":          round(next_interest),
        "interest_paid_so_far":   round(total_interest),
        "principal_paid_so_far":  round(k * monthly_principal),
        "current_annual_rate":    annual_rate,
        "rate_history":           [],
    }


# ── 다음 납부일 ────────────────────────────────────────────────
def get_next_payment_date(start_date_str, payment_day, payments_made):
    try:
        start     = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        next_date = (start + relativedelta(months=payments_made)).replace(day=payment_day)
        return next_date.strftime("%Y-%m-%d")
    except Exception:
        return "계산 불가"


# ── 금리 변경 시 새 구간 시작 원금 계산 ───────────────────────
def calc_remaining_at_change(segments, payments_made):
    """현재 payments_made 기준 잔여 원금 계산 (금리 변경 직전 호출)"""
    segments = sorted(segments, key=lambda s: s["from_payment"])
    current  = next(s for s in segments if s["to_payment"] is None)
    k = payments_made - current["from_payment"]
    return _remaining_principal(
        current["principal_at_start"],
        current["annual_rate"],
        current["term_from_start"],
        k,
    )
