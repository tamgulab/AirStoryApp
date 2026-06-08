# 🌬️ AirStory

**TAMGU Lab, Teachers College, Columbia University**

AirStory is a mobile app and sensor system designed to let high school students collect and explore indoor and outdoor air quality data on their own. It was developed as part of a collaborative research project with The Philadelphia High School for Girls.

---

## 📱 App Features

- **BLE sensor connection**: Connects over Bluetooth to a sensor built on the Raspberry Pi Pico W
- **Real time data collection**: Monitors PM2.5, CO, temperature, and humidity in real time
- **Session recording**: Saves data together with the measurement location, time, and environmental information
- **CSV export**: Saves the collected data as a CSV file
- **History view**: Lets you review data from earlier sessions

---

## 🔧 Sensor Components

| Sensor | Measurement | Model |
| ----- | --------------- | ---------------- |
| Particulate matter | PM2.5 (ug/m³) | PMS7003 |
| Carbon monoxide | CO (ppm) | ZE07-CO |
| Temperature and humidity | Temperature (°C), Humidity (%) | SHT31 |
| Battery | Voltage (V) | LP103665 3000mAh |

---

## 🚀 Sensor Setup

### 1. Install the MicroPython firmware

- Connect the Pico W over USB while holding down its BOOTSEL button
- Copy the `RPI_PICO_W_xx.uf2` file onto the drive that appears

### 2. Install and configure Thonny

- Install [Thonny](https://thonny.org/)
- In the bottom right corner, select **MicroPython (Raspberry Pi Pico)**

### 3. Upload the sensor code

- Open `sensor/main.py` in Thonny
- Change the name to match the sensor number:

```
pico_ble = PicoBLE(name="AirStory1")  # Sensor 1
pico_ble = PicoBLE(name="AirStory2")  # Sensor 2
```

- Save it as `main.py` through **File > Save as > Raspberry Pi Pico**

---

## 📲 Using the App

1. **Set up your group**: In Settings, enter the Period and Group Name, then tap Save
2. **Connect the sensor**: Tap Connect Device, then Scan for Devices, select AirStory, and tap Finish Connection
3. **Start a session**: Tap New Session, enter a session name, and begin measuring
4. **End the session**: Tap End Session, then Save & Exit

---

## 📁 Project Structure

```
AirStoryApp/
├── app/
│   ├── index.tsx        # Home screen
│   ├── connect.tsx      # BLE connection screen
│   ├── session.tsx      # Data collection screen
│   ├── history.tsx      # History screen
│   ├── settings.tsx     # Settings screen
│   └── bleContext.tsx   # BLE context
└── sensor/
    └── main.py          # Pico W sensor code
```

---

## 🛠️ Tech Stack

- **App**: React Native (Expo)
- **Sensor**: MicroPython (Raspberry Pi Pico W)
- **Communication**: Bluetooth Low Energy (BLE)

---

## 📲 APK Download

[Download AirStory v1.0.0](https://expo.dev/accounts/jshim/projects/AirStoryApp/builds/ef2763f9-f638-40ef-b695-766f9ea61688)
