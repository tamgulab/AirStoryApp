import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { BleManager, Device } from "react-native-ble-plx";

export const manager = new BleManager();

interface BLEContextType {
  connectedDevice: Device | null;
  setConnectedDevice: (device: Device | null) => void;
}

const BLEContext = createContext<BLEContextType>({
  connectedDevice: null,
  setConnectedDevice: () => {},
});

export function BLEProvider({ children }: { children: ReactNode }) {
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);

  useEffect(() => {
    if (!connectedDevice) return;

    const subscription = manager.onDeviceDisconnected(connectedDevice.id, () => {
      console.log("Device disconnected!");
      setConnectedDevice(null);
    });

    return () => subscription.remove();
  }, [connectedDevice]);

  return (
    <BLEContext.Provider value={{ connectedDevice, setConnectedDevice }}>
      {children}
    </BLEContext.Provider>
  );
}

export function useBLE() {
  return useContext(BLEContext);
}
