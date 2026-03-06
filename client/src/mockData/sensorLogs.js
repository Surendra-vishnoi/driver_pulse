export const sensorLogs = [
  {
    title: 'Baseline Signal',
    timestamp: 'Just now',
    description: 'Nominal conditions detected with smooth acceleration and stable pathing.',
    tags: ['GPS: STEADY', 'VIBE: LOW'],
    severity: 'nominal',
  },
  {
    title: 'Combined Spike',
    timestamp: '09:42',
    description: 'Tension detected from audio rise combined with a sharp braking event.',
    tags: ['ALERT LEVEL 4'],
    severity: 'alert',
  },
  {
    title: 'Aggressive Traffic',
    timestamp: '09:30',
    description: 'Acceleration/GPS deviation indicates high-frequency lane changes.',
    tags: ['GPS: DRIFT', 'VIBE: HIGH'],
    severity: 'warning',
  },
  {
    title: 'Quiet Environment',
    timestamp: '09:12',
    description: 'Low ambient noise floor maintained consistently for over 15 minutes.',
    tags: ['NOISE: LOW', 'CABIN: CALM'],
    severity: 'nominal',
  },
]
