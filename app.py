"""
Interview Scheduler Flask Application
"""

from flask import Flask, render_template, request, jsonify, Response
import csv
import io
import random
import string
from solver import solve_schedule, validate_schedule

def get_table_letter(index):
    """Generate A, B, C... AA, AB..."""
    # Simple implementation for typical class sizes (A-Z)
    if index < 26:
        return string.ascii_uppercase[index]
    else:
        return f"{string.ascii_uppercase[index // 26 - 1]}{string.ascii_uppercase[index % 26]}"


app = Flask(__name__)


# Default configuration (can be overridden via UI)
DEFAULT_STUDENTS = [
    "Cami Adams", "MJ Akins", "Rowanna Baker", "Katrina Bauer", "Makenna Berkey",
    "Blakely Biggs", "Madalynn Briggs", "Kinsey Burnell", "Christian Cavazos",
    "Ellie Chapman", "Camryn Crochet", "Lauren De Leon", "Macy Ethridge",
    "Ava Garza", "Avery Graves", "Sydney Grubic", "Ava Haworth", "Jackie Hedrick",
    "Georgia Hodson", "Paige Hollis", "Chloe McFarland", "Kelcie Meitz",
    "Andrea Meraz Ortiz", "Marisol Montes", "Amanda Moreno", "Claudia Ochoa",
    "Katelyn P-A", "William Rumscheidt", "Sophie Sheesley", "Presley Stockman",
    "Brianne Sullivan", "Allison Twilla", "Eloisa Urrea", "M.Vanwoudenberg",
    "Kenzie Wheeler", "Rena Wilhite"
]

DEFAULT_PHYSICAL_INTERVIEWERS = ['Christy Bickerstaff', 'Sarah Morris', 'Abby Hazel', 'Kat Elliot', 'Christy Proctor', 'Lexi English', 'Amy Rylander', 'Ashleigh Bickerstaff', 'Desi Gallagher', 'Ronald English', 'Sydney Withey', 'Taylor Wold', 'Abi Young']
DEFAULT_VIRTUAL_INTERVIEWERS = ['Laura McDonald', 'Heather Brandon', 'Rachel Gillock', 'Maggie Light']


@app.route('/')
def index():
    """Serve the main UI."""
    return render_template('index.html',
                          default_students=DEFAULT_STUDENTS,
                          default_physical=DEFAULT_PHYSICAL_INTERVIEWERS,
                          default_virtual=DEFAULT_VIRTUAL_INTERVIEWERS)


@app.route('/api/solve', methods=['POST'])
def solve():
    """Run the scheduler with provided configuration."""
    data = request.json
    
    # Parse students
    students = []
    for s in data.get('students', []):
        students.append({
            'name': s['name'],
            'target': int(s.get('target', 6))
        })
    
    # Parse interviewers & Assign IDs
    interviewers = []
    
    # Separate input to assign IDs primarily based on order, but usually user separates them
    # Actually, let's assign IDs as we process them, maintaining separate counters
    phys_count = 0
    virt_count = 0
    
    for inv in data.get('interviewers', []):
        is_virtual = inv.get('is_virtual', False)
        if is_virtual:
            virt_count += 1
            assigned_id = f"Z-{virt_count}"
        else:
            assigned_id = get_table_letter(phys_count)
            phys_count += 1
            
        interviewers.append({
            'name': inv['name'],
            'is_virtual': is_virtual,
            'id': assigned_id
        })
    
    num_slots = int(data.get('num_slots', 13))
    breaks_per_interviewer = int(data.get('breaks_per_interviewer', 1))
    min_virtual = int(data.get('min_virtual_per_student', 1))
    auto_balance = data.get('auto_balance', False)
    seed = data.get('seed')
    
    if seed is not None:
        seed = int(seed)
    else:
        seed = random.randint(0, 100000)
    
    # Auto-balance if requested
    if auto_balance:
        # Calculate capacity
        num_interviewers = len(interviewers)
        working_slots = num_slots - breaks_per_interviewer
        total_capacity = num_interviewers * working_slots
        current_demand = sum(s['target'] for s in students)
        
        if current_demand > total_capacity:
            deficit = current_demand - total_capacity
            
            # Find eligible students to reduce (those with max interviews)
            # We assume we reduce from the ones with the highest count first
            # Usually this is the default target (e.g. 6)
            
            # Create a localized random generator to not affect the main seed logic if we want stability
            # But the user asked for "randomly pick", so we use the seed if provided or random
            rng = random.Random(seed)
            
            # Reduce iteratively until deficit is gone
            # We filter for students > 1 interview to avoid reducing to 0
            for _ in range(deficit):
                candidates = [s for s in students if s['target'] > 1]
                if not candidates:
                    break
                    
                # Prioritize reducing those with the highest current target
                max_target = max(s['target'] for s in candidates)
                highest_candidates = [s for s in candidates if s['target'] == max_target]
                
                # Pick one
                victim = rng.choice(highest_candidates)
                victim['target'] -= 1

    
    # Solve
    result = solve_schedule(
        students=students,
        interviewers=interviewers,
        num_slots=num_slots,
        breaks_per_interviewer=breaks_per_interviewer,
        min_virtual_per_student=min_virtual,
        seed=seed
    )
    
    # Add validation if successful
    if result['success']:
        errors = validate_schedule(
            result['schedule'], students, interviewers, num_slots, min_virtual
        )
        result['validation_errors'] = errors
        result['seed_used'] = seed
        # Return the modified student configuration so UI can update
        result['students_used'] = students
        
        # Process Interviewer Assignments (Table IDs & Breaks)
        inv_assignments = []
        inv_schedule = result.get('interviewer_schedule', {})
        
        # Create a lookup for interviewer objects
        inv_map = {i['name']: i for i in interviewers}
        
        for name, slots in inv_schedule.items():
            # Find break slot (1-based)
            break_slot = "None"
            if "BREAK" in slots:
                # Add 1 because slots are 0-indexed
                break_slot = slots.index("BREAK") + 1
            
            inv_obj = inv_map.get(name)
            if inv_obj:
                inv_assignments.append({
                    'name': name,
                    'id': inv_obj['id'],
                    'is_virtual': inv_obj['is_virtual'],
                    'break_slot': break_slot
                })
        
        # Sort by ID for display
        # We want A, B, C... then Z-1, Z-2...
        # A simple sort on ID string works: 'A' < 'Z'
        inv_assignments.sort(key=lambda x: x['id'])
        
        result['interviewer_assignments'] = inv_assignments

    
    return jsonify(result)


@app.route('/api/export', methods=['POST'])
def export_csv():
    """Export schedule as CSV."""
    data = request.json
    schedule = data.get('schedule', {})
    num_slots = int(data.get('num_slots', 13))
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    header = ['Student'] + [f'#{i+1}' for i in range(num_slots)] + ['Total']
    writer.writerow(header)
    
    # Data rows
    for name, slots in schedule.items():
        row = [name] + [s if s else 'WAIT' for s in slots]
        total = sum(1 for s in slots if s)
        row.append(total)
        writer.writerow(row)
    
    output.seek(0)
    return Response(
        output.getvalue(),
        mimetype='text/csv',
        headers={'Content-Disposition': 'attachment; filename=interview_schedule.csv'}
    )


if __name__ == '__main__':
    app.run(debug=True, port=5001, host='0.0.0.0')
