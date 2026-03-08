# pipeline/earnings_visualization.py
# ─────────────────────────────────────────────────────────────────────────────
# PROJECTED EARNINGS VISUALIZATION
# Generate interactive charts showing earnings trajectory and projections
# ─────────────────────────────────────────────────────────────────────────────

import sys, os
import logging
import json
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(message)s",
                    stream=sys.stdout, force=True)
logger = logging.getLogger(__name__)


class EarningsVisualization:
    """
    Generate earnings projection visualizations.
    Supports both PNG (matplotlib) and JSON (for web dashboards).
    """
    
    @staticmethod
    def generate_projected_earnings_chart(timeline_data: list, 
                                           driver_id: str, 
                                           driver_name: str,
                                           output_dir: str = None) -> str:
        """
        Generate a projected earnings chart (HTML/interactive).
        
        Args:
            timeline_data: List of {"hour": X, "projected": Y, "target": Z}
            driver_id: driver identifier
            driver_name: driver name for title
            output_dir: where to save HTML file (optional)
        
        Returns:
            HTML string or file path if output_dir provided
        """
        try:
            import matplotlib.pyplot as plt
            import matplotlib.patches as mpatches
        except ImportError:
            logger.warning("matplotlib not installed, returning JSON representation instead")
            return EarningsVisualization.generate_json_chart(timeline_data, driver_id)
        
        if not timeline_data or len(timeline_data) < 2:
            logger.warning(f"Insufficient timeline data for driver {driver_id}")
            return None
        
        # Extract data
        hours = [d["hour"] for d in timeline_data]
        projected = [d["projected"] for d in timeline_data]
        target = timeline_data[0]["target"] if timeline_data else 0
        current = timeline_data[0]["current"] if timeline_data[0].get("current") else projected[0]
        
        # Create figure
        fig, ax = plt.subplots(figsize=(12, 6), dpi=100)
        
        # Plot projected earnings line
        ax.plot(hours, projected, 'b-', linewidth=2.5, label='Projected Earnings', marker='o', markersize=3)
        
        # Plot target line
        ax.axhline(y=target, color='g', linestyle='--', linewidth=2, label=f'Target Goal (₹{target:.0f})', alpha=0.7)
        
        # Highlight current position
        current_hour = hours[0]
        ax.plot(current_hour, current, 'ro', markersize=10, label=f'Current (₹{current:.0f})', zorder=5)
        
        # Shade regions
        current_idx = 0
        future_hours = hours[current_idx:]
        future_projected = projected[current_idx:]
        
        # If above target: shade green
        ax.fill_between(future_hours, target, future_projected, 
                        where=[p >= target for p in future_projected],
                        alpha=0.2, color='green', label='Surplus Zone')
        
        # If below target: shade orange/red
        ax.fill_between(future_hours, future_projected, target,
                        where=[p < target for p in future_projected],
                        alpha=0.2, color='orange', label='Gap Zone')
        
        # Styling
        ax.set_xlabel('Hours Elapsed', fontsize=12, fontweight='bold')
        ax.set_ylabel('Earnings (₹)', fontsize=12, fontweight='bold')
        ax.set_title(f'Projected Earnings Timeline — {driver_name} ({driver_id})', 
                    fontsize=14, fontweight='bold', pad=20)
        
        ax.grid(True, alpha=0.3, linestyle='--')
        ax.legend(loc='upper left', fontsize=10)
        
        # Format y-axis as currency
        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'₹{x:.0f}'))
        
        # Save if output_dir provided
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)
            filename = f"{driver_id}_earnings_projection.png"
            filepath = os.path.join(output_dir, filename)
            plt.savefig(filepath, dpi=100, bbox_inches='tight', facecolor='white')
            logger.info(f"Chart saved: {filepath}")
            plt.close()
            return filepath
        
        return fig
    
    @staticmethod
    def generate_json_chart(timeline_data: list, driver_id: str) -> str:
        """
        Generate chart data as JSON for web dashboard integration.
        
        Args:
            timeline_data: List of {"hour": X, "projected": Y, "target": Z}
            driver_id: driver identifier
        
        Returns:
            JSON string with chart data
        """
        chart_data = {
            "driver_id": driver_id,
            "type": "line",
            "datasets": [
                {
                    "label": "Projected Earnings",
                    "data": [{"x": d["hour"], "y": d["projected"]} for d in timeline_data],
                    "borderColor": "#2196F3",
                    "backgroundColor": "rgba(33, 150, 243, 0.1)",
                    "tension": 0.4,
                    "fill": False,
                },
                {
                    "label": "Target Goal",
                    "data": [{"x": d["hour"], "y": d["target"]} for d in timeline_data],
                    "borderColor": "#4CAF50",
                    "borderDash": [5, 5],
                    "fill": False,
                }
            ],
            "options": {
                "responsive": True,
                "plugins": {
                    "title": {"display": True, "text": f"Projected Earnings — {driver_id}"},
                    "legend": {"display": True, "position": "top"},
                },
                "scales": {
                    "x": {"type": "linear", "title": {"display": True, "text": "Hours Elapsed"}},
                    "y": {"type": "linear", "title": {"display": True, "text": "Earnings (₹)"}},
                }
            }
        }
        
        return json.dumps(chart_data, indent=2)
    
    @staticmethod
    def generate_html_dashboard(metrics: dict, timeline_data: list, output_path: str = None) -> str:
        """
        Generate a complete HTML dashboard with metrics and chart.
        
        Args:
            metrics: Driver metrics dict from TripEarningsTracker
            timeline_data: Projected earnings timeline
            output_path: path to save HTML file (optional)
        
        Returns:
            HTML string or file path if output_path provided
        """
        status_emoji = {
            "ahead": "✅",
            "on_track": "🟢",
            "slightly_behind": "🟡",
            "at_risk": "🟠",
            "off_track": "🔴",
            "too_early": "⏳",
        }
        
        band = metrics.get("pace_band", "unknown").replace("_estimated", "")
        emoji = status_emoji.get(band, "❓")
        
        # Build chart script
        chart_json = EarningsVisualization.generate_json_chart(timeline_data, metrics["driver_id"])
        chart_obj = json.loads(chart_json)
        
        html = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Driver Pulse — {metrics['name']}</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; padding: 20px; }}
        .container {{ max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 30px; }}
        
        .header {{ text-align: center; margin-bottom: 40px; }}
        .driver-name {{ font-size: 28px; font-weight: bold; color: #333; }}
        .driver-status {{ font-size: 48px; margin: 10px 0; }}
        .status-text {{ font-size: 18px; color: #666; }}
        
        .metrics-grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 40px; }}
        .metric-card {{ background: #f9f9f9; border-left: 4px solid #2196F3; padding: 20px; border-radius: 4px; }}
        .metric-label {{ font-size: 12px; color: #999; text-transform: uppercase; font-weight: bold; margin-bottom: 5px; }}
        .metric-value {{ font-size: 24px; font-weight: bold; color: #333; }}
        .metric-unit {{ font-size: 14px; color: #666; }}
        
        .chart-container {{ position: relative; height: 400px; margin: 30px 0; }}
        .message {{ background: #f0f7ff; border-left: 4px solid #2196F3; padding: 15px; border-radius: 4px; font-size: 14px; line-height: 1.6; color: #333; margin: 20px 0; }}
        
        .footer {{ text-align: center; margin-top: 40px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="driver-name">{metrics['name']}<br><span style="font-size: 14px; color: #999;">({metrics['driver_id']})</span></div>
            <div class="driver-status">{emoji}</div>
            <div class="status-text">Pace Band: <strong>{band.replace('_', ' ').title()}</strong> | Score: <strong>{metrics['pace_score']}</strong>/100</div>
        </div>
        
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-label">Current Earnings</div>
                <div class="metric-value">₹{metrics['current_earnings']:.0f}</div>
                <div class="metric-unit">of ₹{metrics['target_earnings']:.0f} goal</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Time Elapsed</div>
                <div class="metric-value">{metrics['current_hours']:.1f}h</div>
                <div class="metric-unit">of {metrics['shift_duration_hours']:.1f}h shift</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Projected Earnings</div>
                <div class="metric-value">₹{metrics['projected_earnings']:.0f}</div>
                <div class="metric-unit">+₹{metrics['projected_earnings'] - metrics['target_earnings']:.0f} vs goal</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Current Pace</div>
                <div class="metric-value">₹{metrics['current_velocity']:.0f}/hr</div>
                <div class="metric-unit">Target: ₹{metrics['target_velocity']:.0f}/hr</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Trips Completed</div>
                <div class="metric-value">{metrics['trips_count']}</div>
                <div class="metric-unit">this shift</div>
            </div>
            <div class="metric-card">
                <div class="metric-label">Remaining Time</div>
                <div class="metric-value">{metrics['remaining_hours']:.1f}h</div>
                <div class="metric-unit">until shift end</div>
            </div>
        </div>
        
        <div class="chart-container">
            <canvas id="earningsChart"></canvas>
        </div>
        
        <div class="message">
            <strong>📊 Driver Message:</strong><br>
            {metrics['driver_message']}
        </div>
        
        <div class="footer">
            Generated at {__import__('datetime').datetime.now().isoformat()}
        </div>
    </div>
    
    <script>
        const ctx = document.getElementById('earningsChart').getContext('2d');
        const chartData = {chart_json};
        
        new Chart(ctx, {{
            type: 'line',
            data: {{
                labels: chartData.datasets[0].data.map(d => d.x.toFixed(2)),
                datasets: [
                    {{
                        label: 'Projected Earnings',
                        data: chartData.datasets[0].data.map(d => d.y),
                        borderColor: '#2196F3',
                        backgroundColor: 'rgba(33, 150, 243, 0.1)',
                        tension: 0.4,
                        fill: true,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                    }},
                    {{
                        label: 'Target Goal',
                        data: chartData.datasets[1].data.map(d => d.y),
                        borderColor: '#4CAF50',
                        borderDash: [5, 5],
                        fill: false,
                        pointRadius: 0,
                    }}
                ]
            }},
            options: {{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {{
                    title: {{ display: true, text: 'Projected Earnings Timeline' }},
                    legend: {{ display: true, position: 'top' }},
                }},
                scales: {{
                    y: {{
                        beginAtZero: true,
                        ticks: {{ callback: function(value) {{ return '₹' + value.toFixed(0); }} }},
                    }},
                    x: {{ title: {{ display: true, text: 'Hours Elapsed' }} }},
                }}
            }}
        }});
    </script>
</body>
</html>
        """
        
        if output_path:
            os.makedirs(os.path.dirname(output_path) if os.path.dirname(output_path) else ".", exist_ok=True)
            with open(output_path, 'w') as f:
                f.write(html)
            logger.info(f"Dashboard saved: {output_path}")
            return output_path
        
        return html
