import { Dashboard } from "@/components/Dashboard";

export default async function SensorPage({
  params,
}: {
  params: Promise<{ deviceId: string }>;
}) {
  const { deviceId } = await params;

  return (
    <div className="min-h-screen bg-page">
      <Dashboard deviceId={decodeURIComponent(deviceId)} />
    </div>
  );
}
