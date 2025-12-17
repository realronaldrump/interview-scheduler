"""
Interview Scheduler Flask Application
"""

from flask import Flask, render_template, request, jsonify, Response
import csv
import io
import os
import random
import string
import pandas as pd
from dotenv import load_dotenv
from solver import solve_schedule, validate_schedule
from database import db, init_db, Event, Student, Interviewer, Schedule

# Load environment variables from .env file (for local development)
load_dotenv()

def get_table_letter(index):
    """Generate A, B, C... AA, AB..."""
    # Simple implementation for typical class sizes (A-Z)
    if index < 26:
        return string.ascii_uppercase[index]
    else:
        return f"{string.ascii_uppercase[index // 26 - 1]}{string.ascii_uppercase[index % 26]}"


app = Flask(__name__)

# Initialize database
init_db(app)


@app.route('/')
def index():
    """Serve the main UI."""
    return render_template('index.html')


# =============================================================================
# Event API Endpoints
# =============================================================================

@app.route('/api/events', methods=['GET'])
def list_events():
    """List all events."""
    events = Event.query.order_by(Event.year.desc(), Event.name).all()
    return jsonify([e.to_dict() for e in events])


@app.route('/api/events', methods=['POST'])
def create_event():
    """Create a new event."""
    data = request.json
    
    event = Event(
        name=data.get('name', 'New Event'),
        year=data.get('year', 2025),
        is_active=data.get('is_active', True)
    )
    
    db.session.add(event)
    db.session.commit()
    
    return jsonify(event.to_dict()), 201


@app.route('/api/events/<int:event_id>', methods=['GET'])
def get_event(event_id):
    """Get a single event with all its data."""
    event = Event.query.get_or_404(event_id)
    
    result = event.to_dict()
    result['students'] = [s.to_dict() for s in event.students]
    result['interviewers'] = [i.to_dict() for i in event.interviewers]
    
    # Get the most recent schedule if any
    latest_schedule = Schedule.query.filter_by(event_id=event_id).order_by(Schedule.created_at.desc()).first()
    result['schedule'] = latest_schedule.to_dict() if latest_schedule else None
    
    return jsonify(result)


@app.route('/api/events/<int:event_id>', methods=['PUT'])
def update_event(event_id):
    """Update an event."""
    event = Event.query.get_or_404(event_id)
    data = request.json
    
    if 'name' in data:
        event.name = data['name']
    if 'year' in data:
        event.year = data['year']
    if 'is_active' in data:
        event.is_active = data['is_active']
    
    db.session.commit()
    return jsonify(event.to_dict())


@app.route('/api/events/<int:event_id>', methods=['DELETE'])
def delete_event(event_id):
    """Delete an event and all related data."""
    event = Event.query.get_or_404(event_id)
    db.session.delete(event)
    db.session.commit()
    return jsonify({'success': True})


# =============================================================================
# Student API Endpoints
# =============================================================================

@app.route('/api/events/<int:event_id>/students', methods=['GET'])
def list_students(event_id):
    """List all students for an event."""
    students = Student.query.filter_by(event_id=event_id).all()
    return jsonify([s.to_dict() for s in students])


@app.route('/api/events/<int:event_id>/students', methods=['POST'])
def add_student(event_id):
    """Add a student to an event."""
    Event.query.get_or_404(event_id)  # Verify event exists
    data = request.json
    
    student = Student(
        event_id=event_id,
        name=data.get('name', 'New Student'),
        target_interviews=data.get('target', 6)
    )
    
    db.session.add(student)
    db.session.commit()
    
    return jsonify(student.to_dict()), 201


@app.route('/api/events/<int:event_id>/students/bulk', methods=['POST'])
def bulk_add_students(event_id):
    """Bulk add students to an event."""
    Event.query.get_or_404(event_id)
    data = request.json
    
    students_data = data.get('students', [])
    default_target = data.get('default_target', 6)
    
    added = []
    for s in students_data:
        if isinstance(s, str):
            # Just a name
            student = Student(event_id=event_id, name=s, target_interviews=default_target)
        else:
            # Object with name and possibly target
            student = Student(
                event_id=event_id, 
                name=s.get('name', 'Unknown'),
                target_interviews=s.get('target', default_target)
            )
        db.session.add(student)
        added.append(student)
    
    db.session.commit()
    return jsonify([s.to_dict() for s in added]), 201


@app.route('/api/events/<int:event_id>/students/<int:student_id>', methods=['PUT'])
def update_student(event_id, student_id):
    """Update a student."""
    student = Student.query.filter_by(id=student_id, event_id=event_id).first_or_404()
    data = request.json
    
    if 'name' in data:
        student.name = data['name']
    if 'target' in data:
        student.target_interviews = data['target']
    
    db.session.commit()
    return jsonify(student.to_dict())


@app.route('/api/events/<int:event_id>/students/<int:student_id>', methods=['DELETE'])
def delete_student(event_id, student_id):
    """Delete a student."""
    student = Student.query.filter_by(id=student_id, event_id=event_id).first_or_404()
    db.session.delete(student)
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/events/<int:event_id>/students', methods=['DELETE'])
def clear_students(event_id):
    """Clear all students for an event."""
    Student.query.filter_by(event_id=event_id).delete()
    db.session.commit()
    return jsonify({'success': True})


# =============================================================================
# Interviewer API Endpoints
# =============================================================================

@app.route('/api/events/<int:event_id>/interviewers', methods=['GET'])
def list_interviewers(event_id):
    """List all interviewers for an event."""
    interviewers = Interviewer.query.filter_by(event_id=event_id).all()
    return jsonify([i.to_dict() for i in interviewers])


@app.route('/api/events/<int:event_id>/interviewers', methods=['POST'])
def add_interviewer(event_id):
    """Add an interviewer to an event."""
    Event.query.get_or_404(event_id)
    data = request.json
    
    interviewer = Interviewer(
        event_id=event_id,
        name=data.get('name', 'New Interviewer'),
        is_virtual=data.get('is_virtual', False)
    )
    
    db.session.add(interviewer)
    db.session.commit()
    
    return jsonify(interviewer.to_dict()), 201


@app.route('/api/events/<int:event_id>/interviewers/bulk', methods=['POST'])
def bulk_add_interviewers(event_id):
    """Bulk add interviewers to an event."""
    Event.query.get_or_404(event_id)
    data = request.json
    
    interviewers_data = data.get('interviewers', [])
    default_virtual = data.get('is_virtual', False)
    
    added = []
    for i in interviewers_data:
        if isinstance(i, str):
            interviewer = Interviewer(event_id=event_id, name=i, is_virtual=default_virtual)
        else:
            interviewer = Interviewer(
                event_id=event_id, 
                name=i.get('name', 'Unknown'),
                is_virtual=i.get('is_virtual', default_virtual)
            )
        db.session.add(interviewer)
        added.append(interviewer)
    
    db.session.commit()
    return jsonify([i.to_dict() for i in added]), 201


@app.route('/api/events/<int:event_id>/interviewers/<int:interviewer_id>', methods=['PUT'])
def update_interviewer(event_id, interviewer_id):
    """Update an interviewer."""
    interviewer = Interviewer.query.filter_by(id=interviewer_id, event_id=event_id).first_or_404()
    data = request.json
    
    if 'name' in data:
        interviewer.name = data['name']
    if 'is_virtual' in data:
        interviewer.is_virtual = data['is_virtual']
    
    db.session.commit()
    return jsonify(interviewer.to_dict())


@app.route('/api/events/<int:event_id>/interviewers/<int:interviewer_id>', methods=['DELETE'])
def delete_interviewer(event_id, interviewer_id):
    """Delete an interviewer."""
    interviewer = Interviewer.query.filter_by(id=interviewer_id, event_id=event_id).first_or_404()
    db.session.delete(interviewer)
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/events/<int:event_id>/interviewers', methods=['DELETE'])
def clear_interviewers(event_id):
    """Clear all interviewers for an event."""
    Interviewer.query.filter_by(event_id=event_id).delete()
    db.session.commit()
    return jsonify({'success': True})


# =============================================================================
# Schedule API Endpoints
# =============================================================================

@app.route('/api/events/<int:event_id>/schedule', methods=['GET'])
def get_schedule(event_id):
    """Get the most recent schedule for an event."""
    schedule = Schedule.query.filter_by(event_id=event_id).order_by(Schedule.created_at.desc()).first()
    
    if not schedule:
        return jsonify({'error': 'No schedule found'}), 404
    
    return jsonify(schedule.to_dict())


@app.route('/api/events/<int:event_id>/schedule', methods=['POST'])
def save_schedule(event_id):
    """Save a schedule for an event."""
    Event.query.get_or_404(event_id)
    data = request.json
    
    schedule = Schedule(
        event_id=event_id,
        schedule_data=data.get('schedule'),
        interviewer_schedule=data.get('interviewer_schedule'),
        interviewer_assignments=data.get('interviewer_assignments'),
        seed_used=data.get('seed_used'),
        config=data.get('config')
    )
    
    db.session.add(schedule)
    db.session.commit()
    
    return jsonify(schedule.to_dict()), 201


@app.route('/api/events/<int:event_id>/schedule', methods=['DELETE'])
def clear_schedule(event_id):
    """Clear all schedules for an event."""
    Schedule.query.filter_by(event_id=event_id).delete()
    db.session.commit()
    return jsonify({'success': True})


# =============================================================================
# Solve Endpoint (Updated)
# =============================================================================

@app.route('/api/solve', methods=['POST'])
def solve():
    """Run the scheduler with provided configuration."""
    data = request.json
    
    event_id = data.get('event_id')
    
    # Parse students
    students = []
    for s in data.get('students', []):
        students.append({
            'name': s['name'],
            'target': int(s.get('target', 6))
        })
    
    # Parse interviewers & Assign IDs
    interviewers = []
    
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
        num_interviewers = len(interviewers)
        working_slots = num_slots - breaks_min
        total_capacity = num_interviewers * working_slots
        current_demand = sum(s['target'] for s in students)
        
        if current_demand > total_capacity:
            deficit = current_demand - total_capacity
            rng = random.Random(seed)
            
            for _ in range(deficit):
                candidates = [s for s in students if s['target'] > 1]
                if not candidates:
                    break
                    
                max_target = max(s['target'] for s in candidates)
                highest_candidates = [s for s in candidates if s['target'] == max_target]
                
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
        result['students_used'] = students
        
        # Process Interviewer Assignments (Table IDs & Breaks)
        inv_assignments = []
        inv_schedule = result.get('interviewer_schedule', {})
        
        inv_map = {i['name']: i for i in interviewers}
        
        for name, slots in inv_schedule.items():
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
        
        inv_assignments.sort(key=lambda x: x['id'])
        result['interviewer_assignments'] = inv_assignments
        
        # Auto-save schedule if event_id provided
        if event_id:
            schedule = Schedule(
                event_id=event_id,
                schedule_data=result['schedule'],
                interviewer_schedule=result.get('interviewer_schedule'),
                interviewer_assignments=inv_assignments,
                seed_used=seed,
                config={
                    'num_slots': num_slots,
                    'breaks_min': breaks_min,
                    'breaks_max': breaks_max,
                    'min_virtual': min_virtual,
                    'max_virtual': max_virtual
                }
            )
            db.session.add(schedule)
            
            # Also update student targets if auto-balanced
            if auto_balance:
                for s_data in students:
                    student = Student.query.filter_by(event_id=event_id, name=s_data['name']).first()
                    if student:
                        student.target_interviews = s_data['target']
            
            db.session.commit()

    
    return jsonify(result)


# =============================================================================
# Export Endpoint
# =============================================================================

@app.route('/api/export', methods=['POST'])
def export_schedule():
    """Export schedule as Excel (styled) or CSV."""
    data = request.json
    schedule = data.get('schedule', {})
    num_slots = int(data.get('num_slots', 13))

    headers = ['Student Name'] + [f'Slot {i+1}' for i in range(num_slots)] + ['Total']
    rows = []
    
    virtual_interviewers = set(data.get('virtual_interviewers', []))

    for name, slots in schedule.items():
        row_data = [name]
        count = 0
        for s in slots:
            if s:
                row_data.append(s)
                count += 1
            else:
                row_data.append('BREAK')
        
        row_data.append(count)
        rows.append(row_data)

    df = pd.DataFrame(rows, columns=headers)

    output = io.BytesIO()
    
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        df.to_excel(writer, sheet_name='Schedule', index=False, startrow=1)
        
        workbook = writer.book
        worksheet = writer.sheets['Schedule']
        
        header_format = workbook.add_format({
            'bold': True,
            'text_wrap': True,
            'valign': 'top',
            'fg_color': '#154734',
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

        for col_num, value in enumerate(df.columns.values):
            worksheet.write(0, col_num, value, header_format)

        for row_num, row_data in enumerate(rows):
            worksheet.write(row_num + 1, 0, row_data[0], name_format)
            
            for col_num in range(1, num_slots + 1):
                cell_val = row_data[col_num]
                
                if cell_val == 'BREAK':
                    worksheet.write(row_num + 1, col_num, "Break", break_format)
                elif cell_val in virtual_interviewers:
                    worksheet.write(row_num + 1, col_num, cell_val, virtual_format)
                else:
                    worksheet.write(row_num + 1, col_num, cell_val, cell_format)
            
            worksheet.write(row_num + 1, num_slots + 1, row_data[-1], name_format)

        worksheet.autofit()

    output.seek(0)
    
    return Response(
        output.getvalue(),
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': 'attachment; filename=Interview_Schedule.xlsx'}
    )


if __name__ == '__main__':
    app.run(debug=True, port=5001, host='0.0.0.0')
