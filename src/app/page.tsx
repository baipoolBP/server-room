import { Dashboard } from "@/components/Dashboard";
import { DEFAULT_DEVICE_ID } from "@/lib/config";

export default function Home() {
  return (
    <div className="min-h-screen bg-page">
      <Dashboard deviceId={DEFAULT_DEVICE_ID} />
    </div>
  );
}
