import { createContext, useCallback, useContext, useState, useEffect, ReactNode } from "react";
import { BleManager, Device } from "react-native-ble-plx";

export const manager = new BleManager();

interface BLEContextType {
  connectedDevice: Device | null;
  setConnectedDevice: (device: Device | null) => void;
  /** Close the link to the sensor and forget it. The only way the app releases a connection. */
  disconnectDevice: () => Promise<void>;
}

const BLEContext = createContext<BLEContextType>({
  connectedDevice: null,
  setConnectedDevice: () => {},
  disconnectDevice: async () => {},
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

  // Cancelling disposes the native connection, which is what makes the phone send the link-layer
  // disconnect: without it the board keeps its LED on and stops advertising. State is cleared even
  // if the cancel fails (e.g. the link already dropped), so the app never shows a dead device.
  const disconnectDevice = useCallback(async () => {
    if (connectedDevice) {
      try {
        await manager.cancelDeviceConnection(connectedDevice.id);
      } catch (e) {
        console.log("Disconnect error:", e);
      }
    }
    setConnectedDevice(null);
  }, [connectedDevice]);

  return (
    <BLEContext.Provider value={{ connectedDevice, setConnectedDevice, disconnectDevice }}>
      {children}
    </BLEContext.Provider>
  );
}

export function useBLE() {
  return useContext(BLEContext);
}
