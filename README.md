# 🌬️ AirStory

**TAMGU Lab, Teachers College Columbia University**

AirStory는 고등학생들이 실내외 공기질 데이터를 직접 수집하고 탐구할 수 있도록 설계된 모바일 앱 + 센서 시스템입니다. Philadelphia High School for Girls와의 협력 연구 프로젝트의 일환으로 개발되었습니다.

---

## 📱 앱 주요 기능

- **BLE 센서 연결** - Raspberry Pi Pico W 기반 센서와 블루투스로 연결
- **실시간 데이터 수집** - PM2.5, CO, 온도, 습도 실시간 모니터링
- **세션 기록** - 측정 위치, 시간, 환경 정보와 함께 데이터 저장
- **CSV 내보내기** - 수집된 데이터를 CSV 파일로 저장
- **기록 보기** - 이전 세션 데이터 확인

---

## 🔧 센서 구성

| 센서 | 측정 항목 | 모델 |
|------|-----------|------|
| 미세먼지 | PM2.5 (ug/m³) | PMS7003 |
| 일산화탄소 | CO (ppm) | ZE07-CO |
| 온습도 | 온도 (°C), 습도 (%) | SHT31 |
| 배터리 | 전압 (V) | LP103665 3000mAh |

---

## 🚀 센서 설정 방법

### 1. MicroPython 펌웨어 설치
- Pico W의 BOOTSEL 버튼을 누른 채 USB 연결
- `RPI_PICO_W_xx.uf2` 파일을 드라이브에 복사

### 2. Thonny 설치 및 설정
- [Thonny](https://thonny.org/) 설치
- 오른쪽 하단에서 **MicroPython (Raspberry Pi Pico)** 선택

### 3. 센서 코드 업로드
- `sensor/main.py` 파일을 Thonny에서 열기
- 센서 번호에 따라 이름 변경:
```python
  pico_ble = PicoBLE(name="AirStory1")  # 1번 센서
  pico_ble = PicoBLE(name="AirStory2")  # 2번 센서
```
- **File > Save as > Raspberry Pi Pico** 에서 `main.py`로 저장

---

## 📲 앱 사용 방법

1. **그룹 설정** - Settings에서 Period, Group Name 입력 후 Save
2. **센서 연결** - Connect Device 버튼 → Scan for Devices → AirStory 선택 → Finish Connection
3. **세션 시작** - New Session 버튼 → 세션 이름 입력 → 측정 시작
4. **세션 종료** - End Session → Save & Exit

---

## 📁 프로젝트 구조

```
AirStoryApp/
├── app/
│   ├── index.tsx        # 홈 화면
│   ├── connect.tsx      # BLE 연결 화면
│   ├── session.tsx      # 데이터 수집 화면
│   ├── history.tsx      # 기록 보기 화면
│   ├── settings.tsx     # 설정 화면
│   └── bleContext.tsx   # BLE 컨텍스트
└── sensor/
    └── main.py          # Pico W 센서 코드
```

---

## 🛠️ 개발 환경

- **앱**: React Native (Expo)
- **센서**: MicroPython (Raspberry Pi Pico W)
- **통신**: Bluetooth Low Energy (BLE)

## 📲 APK 다운로드
[AirStory v1.0.0 다운로드](https://expo.dev/accounts/jshim/projects/AirStoryApp/builds/ef2763f9-f638-40ef-b695-766f9ea61688)