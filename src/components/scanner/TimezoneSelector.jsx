import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe } from 'lucide-react';

const timezones = [
  { value: 'UTC', label: 'UTC' },
  { value: 'America/New_York', label: 'EST/EDT' },
  { value: 'America/Chicago', label: 'CST/CDT' },
  { value: 'America/Denver', label: 'MST/MDT' },
  { value: 'America/Los_Angeles', label: 'PST/PDT' },
  { value: 'Europe/London', label: 'GMT/BST' },
  { value: 'Europe/Paris', label: 'CET/CEST' },
  { value: 'Asia/Tokyo', label: 'JST' },
  { value: 'Asia/Shanghai', label: 'CST' },
  { value: 'Australia/Sydney', label: 'AEST/AEDT' },
];

export default function TimezoneSelector({ value, onChange }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-32 h-9 bg-slate-900/50 border-slate-700 text-white text-xs">
        <Globe className="w-3 h-3 mr-1 text-slate-500" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="bg-slate-800 border-slate-700">
        {timezones.map((tz) => (
          <SelectItem key={tz.value} value={tz.value} className="text-xs">
            {tz.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}