"""
Interview Scheduler Flask Application
"""

from flask import Flask, render_template, request, jsonify, Response
import csv
import io
import random
import string
import pandas as pd
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
    # Flexible breaks
    breaks_min = int(data.get('breaks_min', 1))
    breaks_max = int(data.get('breaks_max', breaks_min))
    
    min_virtual = int(data.get('min_virtual_per_student', 1))
    max_virtual = int(data.get('max_virtual_per_student', min_virtual))
    
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
        # Use min breaks for max theoretical capacity
        working_slots = num_slots - breaks_min
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
        breaks_min=breaks_min,
        breaks_max=breaks_max,
        min_virtual_per_student=min_virtual,
        max_virtual_per_student=max_virtual,
        seed=seed
    )
    
    # Add validation if successful
    if result['success']:
        errors = validate_schedule(
            result['schedule'], students, interviewers, num_slots, min_virtual, max_virtual
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
            # Find all break slots (1-based)
            break_indices = [i + 1 for i, s in enumerate(slots) if s == "BREAK"]
            
            if not break_indices:
                break_display = "None"
            else:
                break_display = ", ".join(map(str, break_indices))
            
            inv_obj = inv_map.get(name)
            if inv_obj:
                inv_assignments.append({
                    'name': name,
                    'id': inv_obj['id'],
                    'is_virtual': inv_obj['is_virtual'],
                    'break_slot': break_display
                })
        
        # Sort by ID for display
        # We want A, B, C... then Z-1, Z-2...
        # A simple sort on ID string works: 'A' < 'Z'
        inv_assignments.sort(key=lambda x: x['id'])
        
        result['interviewer_assignments'] = inv_assignments

    
    return jsonify(result)


@app.route('/api/export', methods=['POST'])
def export_schedule():
    """Export schedule as Excel (styled) or CSV."""
    data = request.json
    schedule = data.get('schedule', {})
    num_slots = int(data.get('num_slots', 13))
    export_format = data.get('format', 'xlsx')  # Default to xlsx

    # Prepare Data
    # Rows: Student Name, Slot 1, Slot 2, ..., Total
    headers = ['Student Name'] + [f'Slot {i+1}' for i in range(num_slots)] + ['Total']
    rows = []
    
    # Identify Virtual Interviewers to style them
    # We need to pass virtual interviewers list or infer it? 
    # Current frontend sends 'schedule'. We might need to know who is virtual.
    # The frontend payload for export is currently just {schedule, num_slots}.
    # We should update frontend to send 'virtual_interviewers' list or similar to help with styling.
    # OR we can just rely on the schedule if we can't easily get it. 
    # BUT the user asked for "match styling as seen in app" which distinguishes virtual.
    # So I will assume the frontend will send `virtual_interviewers` list.
    
    virtual_interviewers = set(data.get('virtual_interviewers', []))

    for name, slots in schedule.items():
        row_data = [name]
        count = 0
        for s in slots:
            if s:
                row_data.append(s)
                count += 1
            else:
                row_data.append('BREAK') # Or empty? App shows "Break" in wait slots in logic check? No, app shows "Break" if null.
        
        row_data.append(count)
        rows.append(row_data)

    df = pd.DataFrame(rows, columns=headers)

    output = io.BytesIO()
    
    # Create Excel Writer using xlsxwriter
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        df.to_excel(writer, sheet_name='Schedule', index=False, startrow=1) # Start at row 1 to leave room for custom header if needed, or just 0. Let's do 0 but manual write.
        
        workbook = writer.book
        worksheet = writer.sheets['Schedule']
        
        # Styles
        header_format = workbook.add_format({
            'bold': True,
            'text_wrap': True,
            'valign': 'top',
            'fg_color': '#154734', # Baylor Green
            'font_color': '#FFFFFF',
            'border': 1
        })
        
        cell_format = workbook.add_format({'border': 1})
        
        virtual_format = workbook.add_format({
            'bg_color': '#E6F3FF',
            'font_color': '#0066CC',
            'bold': True,
            'border': 1
        })
        
        break_format = workbook.add_format({
            'font_color': '#999999',
            'italic': True,
            'border': 1,
            'bg_color': '#FAFAFA'
        })
        
        name_format = workbook.add_format({
            'bold': True,
            'border': 1,
            'bg_color': '#F8F8F8'
        })

        # Write Header manually to apply style
        for col_num, value in enumerate(df.columns.values):
            worksheet.write(0, col_num, value, header_format)

        # Write Data with conditional formatting
        # Iterate over df rows
        for row_num, row_data in enumerate(rows):
            # Write Name (Col 0)
            worksheet.write(row_num + 1, 0, row_data[0], name_format)
            
            # Write Slots
            for col_num in range(1, num_slots + 1):
                cell_val = row_data[col_num]
                
                # Check style
                if cell_val == 'BREAK':
                    worksheet.write(row_num + 1, col_num, "Break", break_format)
                elif cell_val in virtual_interviewers:
                    worksheet.write(row_num + 1, col_num, cell_val, virtual_format)
                else:
                    worksheet.write(row_num + 1, col_num, cell_val, cell_format)
            
            # Write Total (Last Col)
            worksheet.write(row_num + 1, num_slots + 1, row_data[-1], name_format)

        # Auto-fit columns
        worksheet.autofit()

    output.seek(0)
    
    return Response(
        output.getvalue(),
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': 'attachment; filename=Fall 2025 Mock Interview Rotation Schedule.xlsx'}
    )


if __name__ == '__main__':
    app.run(debug=True, port=5001, host='0.0.0.0')
