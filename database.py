import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "assets.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    c = conn.cursor()

    c.executescript("""
    CREATE TABLE IF NOT EXISTS assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        subcategory TEXT DEFAULT '',
        name TEXT NOT NULL,
        ticker TEXT DEFAULT '',
        quantity REAL DEFAULT 0,
        avg_price REAL DEFAULT 0,
        purchase_amount REAL DEFAULT 0,
        currency TEXT DEFAULT 'KRW',
        is_staking INTEGER DEFAULT 0,
        notes TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS loans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        loan_type TEXT NOT NULL,
        original_principal REAL NOT NULL,
        annual_rate REAL NOT NULL,
        start_date TEXT NOT NULL,
        payment_day INTEGER NOT NULL,
        term_months INTEGER NOT NULL,
        repayment_type TEXT NOT NULL,
        payments_made INTEGER DEFAULT 0,
        notes TEXT DEFAULT ''
    );

    -- 금리 구간 이력 (원리금균등상환 대출에만 사용)
    CREATE TABLE IF NOT EXISTS loan_rate_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        loan_id INTEGER NOT NULL,
        annual_rate REAL NOT NULL,
        from_payment INTEGER NOT NULL DEFAULT 0,
        to_payment INTEGER,                     -- NULL = 현재 진행 중
        principal_at_start REAL NOT NULL,       -- 이 구간 시작 시점의 잔여 원금
        term_from_start INTEGER NOT NULL,       -- 이 구간 시작 시점의 잔여 기간(개월)
        applied_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 앱 설정 (key-value)
    CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
    );

    -- 연금 원금 납입 기록
    CREATE TABLE IF NOT EXISTS pension_contributions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_type TEXT NOT NULL,   -- 'pension_savings' | 'irp' | 'personal_company'
        amount REAL NOT NULL,
        contributed_date TEXT NOT NULL,
        memo TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    -- 실현손익 기록
    CREATE TABLE IF NOT EXISTS realized_pnl (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL DEFAULT 'stocks',
        year  INTEGER NOT NULL,
        month INTEGER NOT NULL,        -- 0 = 연간 합산 (직접 입력), 1~12 = 월별
        amount REAL NOT NULL,
        memo TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_date TEXT NOT NULL,
        total_assets REAL NOT NULL,
        total_liabilities REAL NOT NULL,
        net_worth REAL NOT NULL,
        breakdown TEXT NOT NULL,
        memo TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    """)

    # ── 대출 기본값 (최초 실행 시) ────────────────────────────
    loan_count = c.execute("SELECT COUNT(*) FROM loans").fetchone()[0]
    if loan_count == 0:
        c.execute("""INSERT INTO loans
            (name, loan_type, original_principal, annual_rate, start_date,
             payment_day, term_months, repayment_type, payments_made, notes)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            ("주택담보대출", "mortgage",
             490_000_000, 4.16, "2026-05-20",
             20, 360, "equal_payment", 1,
             "4.16% 6개월 변동금리, 30년만기 원리금균등상환"))
        mortgage_id = c.lastrowid

        c.execute("""INSERT INTO loans
            (name, loan_type, original_principal, annual_rate, start_date,
             payment_day, term_months, repayment_type, payments_made, notes)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            ("회사대출", "company",
             50_000_000, 2.0, "2026-05-21",
             21, 60, "equal_principal", 1,
             "2% 고정금리, 5년만기 원금균등상환"))

        # 주담대 최초 금리 구간 초기화
        c.execute("""INSERT INTO loan_rate_segments
            (loan_id, annual_rate, from_payment, to_payment,
             principal_at_start, term_from_start)
            VALUES (?,?,?,?,?,?)""",
            (mortgage_id, 4.16, 0, None, 490_000_000, 360))

    else:
        # ── 기존 데이터가 있으나 rate_segments 누락 시 보정 ──
        rows = c.execute(
            "SELECT id FROM loans WHERE repayment_type='equal_payment'"
        ).fetchall()
        for row in rows:
            lid = row["id"]
            seg_count = c.execute(
                "SELECT COUNT(*) FROM loan_rate_segments WHERE loan_id=?", (lid,)
            ).fetchone()[0]
            if seg_count == 0:
                loan = dict(c.execute(
                    "SELECT * FROM loans WHERE id=?", (lid,)
                ).fetchone())
                c.execute("""INSERT INTO loan_rate_segments
                    (loan_id, annual_rate, from_payment, to_payment,
                     principal_at_start, term_from_start)
                    VALUES (?,?,?,?,?,?)""",
                    (lid, loan["annual_rate"], 0, None,
                     loan["original_principal"], loan["term_months"]))

    conn.commit()
    conn.close()
