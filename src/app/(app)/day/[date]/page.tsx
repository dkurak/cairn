"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import DayView from "@/components/DayView";
import { useApp } from "@/components/AppProvider";

export default function Day() {
  const { date } = useParams<{ date: string }>();
  const router = useRouter();
  const { today } = useApp();
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  useEffect(() => { if (!valid || date === today) router.replace("/"); }, [valid, date, today, router]);
  if (!valid || date === today) return null;
  return <DayView date={date} />;
}
