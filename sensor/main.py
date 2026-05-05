import bluetooth
import time
from micropython import const
from machine import Pin, UART, I2C, ADC

# ----------------------------
# LED 핀 설정 (액티브 LOW: 0=ON, 1=OFF)
# ----------------------------
ble_led  = Pin(3, Pin.OUT)  # 파란 LED - 블루투스 연결
batt_led = Pin(4, Pin.OUT)  # 초록 LED - 배터리 상태
data_led = Pin(5, Pin.OUT)  # 노란 LED - 데이터 전송

# BAT_CHRG - 충전 상태 입력 (GP1, active LOW)
chrg_pin = Pin(1, Pin.IN, Pin.PULL_UP)

# 시작시 모두 OFF
ble_led.value(1)
batt_led.value(1)
data_led.value(1)

# ----------------------------
# PM2.5 센서 (PMS7003)
# ----------------------------
rst_pin = Pin(6, Pin.OUT)
set_pin = Pin(7, Pin.OUT)
dust_uart = UART(1, baudrate=9600, tx=Pin(8), rx=Pin(9), timeout=100)

def init_dust():
    rst_pin.value(0); time.sleep(1)
    rst_pin.value(1); time.sleep(1)
    set_pin.value(0); time.sleep(2)
    set_pin.value(1)
    print("PM2.5 센서 초기화 완료")

def read_dust():
    if dust_uart.any() >= 32:
        buffer = dust_uart.read(32)
        if buffer and buffer[0] == 0x42 and buffer[1] == 0x4d:
            if len(buffer) >= 14:
                pm25 = (buffer[12] << 8) | buffer[13]
                return pm25
    return None

# ----------------------------
# CO 센서 (ZE07-CO)
# ----------------------------
co_pwr = Pin(2, Pin.OUT)
co_uart = UART(0, baudrate=9600, tx=Pin(12), rx=Pin(13), timeout=100)

def init_co():
    co_pwr.value(0); time.sleep(2)
    co_pwr.value(1)
    print("CO 센서 초기화 완료")

def read_co():
    if co_uart.any() >= 9:
        raw = co_uart.read(9)
        if raw and raw[0] == 0xFF and raw[1] == 0x04:
            return ((raw[4] << 8) | raw[5]) * 0.1
    return None

# ----------------------------
# 온습도 센서 (SHT31)
# ----------------------------
i2c = I2C(0, sda=Pin(20), scl=Pin(21), freq=100000)
rst_sht = Pin(22, Pin.OUT)
rst_sht.value(1)
SHT31_ADDR = 0x44

def calc_crc(data):
    crc = 0xFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            crc = ((crc << 1) ^ 0x31) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc

def read_sht31():
    try:
        i2c.writeto(SHT31_ADDR, b'\x24\x00')
        time.sleep_ms(15)
        data = i2c.readfrom(SHT31_ADDR, 6)
        if data[2] != calc_crc(data[0:2]) or data[5] != calc_crc(data[3:5]):
            return None, None
        temp = -45 + (175 * ((data[0] << 8) | data[1]) / 65535)
        hum  = 100 * ((data[3] << 8) | data[4]) / 65535
        return round(temp, 1), round(hum, 1)
    except:
        return None, None

# ----------------------------
# 배터리 ADC
# ----------------------------
batt_adc = ADC(28)

def read_battery():
    raw = batt_adc.read_u16()
    v_adc = raw * 3.3 / 65535
    v_batt = v_adc * 1.6667
    return round(v_batt, 2)

# ----------------------------
# BLE 설정
# ----------------------------
_IRQ_CENTRAL_CONNECT    = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE        = const(3)

SERVICE_UUID = bluetooth.UUID("0000181A-0000-1000-8000-00805F9B34FB")
CHAR_UUID    = bluetooth.UUID("00002A6E-0000-1000-8000-00805F9B34FB")
NOTIFY_UUID  = bluetooth.UUID("00002A6F-0000-1000-8000-00805F9B34FB")

CHAR_FLAGS = (
    bluetooth.FLAG_WRITE |
    bluetooth.FLAG_WRITE_NO_RESPONSE |
    bluetooth.FLAG_READ |
    bluetooth.FLAG_NOTIFY
)
SERVICE = (SERVICE_UUID, ((CHAR_UUID, CHAR_FLAGS),),)

class PicoBLE:
    def __init__(self, name="AirStory1"):
        self.ble = bluetooth.BLE()
        self.ble.active(True)
        self.ble.irq(self._irq)
        ((self.char_handle,),) = self.ble.gatts_register_services((SERVICE,))
        self.conn_handle = None
        self._name = name
        self._advertise()
        print(f"[{name}] advertising...")

    def _advertise(self):
        name_b = self._name.encode()
        self.ble.gap_advertise(
            100_000,
            adv_data=bytearray(b"\x02\x01\x06") + bytes((len(name_b)+1, 0x09)) + name_b
        )

    def _irq(self, event, data):
        if event == _IRQ_CENTRAL_CONNECT:
            self.conn_handle, _, _ = data
            ble_led.value(0)  # 파란 LED ON
            print(">> connected")
        elif event == _IRQ_CENTRAL_DISCONNECT:
            self.conn_handle = None
            ble_led.value(1)  # 파란 LED OFF
            print(">> disconnected")
            self._advertise()

    def send(self, text):
        if self.conn_handle is not None:
            self.ble.gatts_notify(self.conn_handle, self.char_handle, text.encode())

# ----------------------------
# 초기화
# ----------------------------
print("센서 초기화 중...")
init_dust()
init_co()
print("\n준비 완료!")

pico_ble = PicoBLE(name="AirStory1")

# ----------------------------
# 메인 루프
# ----------------------------
batt_led_state = 1  # 1=OFF, 0=ON (초기 상태 OFF)

while True:
    charging = (chrg_pin.value() == 0)  # 충전 중이면 True

    # 배터리 확인 후 초록 LED (충전 중이 아닐 때만 전압으로 결정)
    v_batt = read_battery()
    if not charging:
        batt_led_state = 0 if v_batt > 3.5 else 1
        batt_led.value(batt_led_state)

    # 센서 읽기
    pm25 = read_dust()
    co   = read_co()
    temp, hum = read_sht31()

    # 기본값 처리
    pm25 = pm25 if pm25 is not None else 0
    co   = co   if co   is not None else 0.0
    temp = temp if temp is not None else 0.0
    hum  = hum  if hum  is not None else 0.0

    # 데이터 문자열 (CSV 형식)
    data_str = f"{pm25},{co:.1f},{temp},{hum},{v_batt}"
    print(f"데이터: {data_str} | 배터리: {v_batt}V")

    # BLE 전송 + 노란 LED 깜빡
    data_led.value(0)   # 노란 LED ON
    pico_ble.send(data_str)
    time.sleep_ms(100)
    data_led.value(1)   # 노란 LED OFF

    # 3초 sleep을 1초씩 분할 - 충전 중이면 LED 깜빡임
    for _ in range(3):
        if charging:
            batt_led_state = 1 - batt_led_state  # 0↔1 토글
            batt_led.value(batt_led_state)
        time.sleep(1)
