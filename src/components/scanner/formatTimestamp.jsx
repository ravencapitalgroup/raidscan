export function formatTimestamp(isoString, timezone = 'UTC') {
  if (!isoString) return '';
  
  try {
    const date = new Date(isoString);
    
    const options = {
      timeZone: timezone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    };
    
    return date.toLocaleString('en-US', options);
  } catch (error) {
    return isoString;
  }
}