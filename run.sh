#!/bin/bash
cd "$(dirname "$0")"

# 패키지 확인 및 설치
pip3 install flask yfinance requests python-dateutil -q 2>/dev/null

# 포트 5001이 사용 중이면 종료
lsof -ti:5001 | xargs kill -9 2>/dev/null
sleep 0.5

echo "🚀 자산 트래커 시작: http://localhost:5001"
python3 app.py
