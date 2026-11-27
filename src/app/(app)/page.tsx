"use client";
import DayView from "@/components/DayView";
import { useApp } from "@/components/AppProvider";

export default function Today() {
  const { today } = useApp();
  return <DayView date={today} />;
}
