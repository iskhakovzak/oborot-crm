import { Send, MessageCircle, MessageSquare, Mail, Smartphone, Globe } from "lucide-react";
import { InstagramIcon } from "@/components/ui/instagram-icon";
import type { Channel } from "@/db/schema";
import { cn } from "@/lib/utils";

export const CHANNELS: Record<Channel, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  telegram: { label: "Telegram", color: "#2aabee", icon: Send },
  whatsapp: { label: "WhatsApp", color: "#25d366", icon: MessageCircle },
  instagram: { label: "Instagram", color: "#E1306C", icon: InstagramIcon },
  max: { label: "MAX", color: "#7b3fe4", icon: MessageSquare },
  email: { label: "Почта", color: "#b96a00", icon: Mail },
  sms: { label: "SMS", color: "#4b5260", icon: Smartphone },
  web: { label: "Сайт", color: "#138a5e", icon: Globe },
};
export const CHANNEL_LIST = Object.keys(CHANNELS) as Channel[];

export function ChannelIcon({ channel, size = 16, className, plain }: { channel: Channel; size?: number; className?: string; plain?: boolean }) {
  const c = CHANNELS[channel];
  const I = c.icon;
  if (plain) return <I className={cn("shrink-0", className)} />;
  return (
    <span className={cn("inline-grid shrink-0 place-items-center rounded-full text-white", className)} style={{ width: size, height: size, background: c.color }} title={c.label}>
      <I className="size-[58%]" />
    </span>
  );
}
