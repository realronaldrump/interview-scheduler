"""
Interview Scheduling Solver Module

Constraint-satisfaction solver using OR-Tools CP-SAT for zero-slack interview scheduling.
"""

from ortools.sat.python import cp_model
from typing import Optional


def solve_schedule(
    students: list[dict],
    interviewers: list[dict],
    num_slots: int = 13,
    breaks_per_interviewer: int = 1,
    min_virtual_per_student: int = 1,
    seed: Optional[int] = None
) -> dict:
    """
    Solve the interview scheduling problem.
    
    Args:
        students: List of dicts with 'name' and 'target' (interview count)
        interviewers: List of dicts with 'name' and 'is_virtual' (bool)
        num_slots: Number of time slots
        breaks_per_interviewer: Breaks each interviewer must take
        min_virtual_per_student: Minimum virtual interviews per student
        seed: Random seed for reproducibility (optional)
    
    Returns:
        dict with 'success', 'schedule', 'error', and 'stats'
    """
    
    # Validate inputs
    num_interviewers = len(interviewers)
    working_slots = num_slots - breaks_per_interviewer
    total_capacity = num_interviewers * working_slots
    total_demand = sum(s['target'] for s in students)
    
    virtual_interviewers = [i for i, inv in enumerate(interviewers) if inv['is_virtual']]
    virtual_capacity = len(virtual_interviewers) * working_slots
    virtual_demand = len(students) * min_virtual_per_student
    
    if total_demand > total_capacity:
        return {
            'success': False,
            'schedule': None,
            'error': f'Demand ({total_demand}) exceeds capacity ({total_capacity}). '
                     f'Reduce student interview counts or add interviewers.',
            'stats': {'capacity': total_capacity, 'demand': total_demand}
        }
    
    if virtual_demand > virtual_capacity:
        return {
            'success': False,
            'schedule': None,
            'error': f'Virtual demand ({virtual_demand}) exceeds virtual capacity ({virtual_capacity}). '
                     f'Add more virtual interviewers or reduce minimum virtual requirement.',
            'stats': {'virtual_capacity': virtual_capacity, 'virtual_demand': virtual_demand}
        }
    
    model = cp_model.CpModel()
    
    # Decision variables: x[s, t, i] = 1 if student s meets interviewer i at slot t
    x = {}
    for s_idx in range(len(students)):
        for t in range(num_slots):
            for i in range(num_interviewers):
                x[s_idx, t, i] = model.NewBoolVar(f'x_{s_idx}_{t}_{i}')
    
    # Break variables: breaks[i, t] = 1 if interviewer i has break at slot t
    breaks = {}
    for i in range(num_interviewers):
        for t in range(num_slots):
            breaks[i, t] = model.NewBoolVar(f'break_{i}_{t}')
    
    # CONSTRAINT 1: Each interviewer has exactly breaks_per_interviewer breaks
    for i in range(num_interviewers):
        model.Add(sum(breaks[i, t] for t in range(num_slots)) == breaks_per_interviewer)
    
    # CONSTRAINT 2: If interviewer has break, they can't interview
    for i in range(num_interviewers):
        for t in range(num_slots):
            for s_idx in range(len(students)):
                model.Add(x[s_idx, t, i] == 0).OnlyEnforceIf(breaks[i, t])
    
    # CONSTRAINT 3: Each interviewer interviews at most 1 student per slot
    for i in range(num_interviewers):
        for t in range(num_slots):
            model.Add(sum(x[s_idx, t, i] for s_idx in range(len(students))) <= 1)
    
    # CONSTRAINT 4: Each student interviewed at most once per slot
    for s_idx in range(len(students)):
        for t in range(num_slots):
            model.Add(sum(x[s_idx, t, i] for i in range(num_interviewers)) <= 1)
    
    # CONSTRAINT 5: Each student gets exactly their target interviews
    for s_idx, s in enumerate(students):
        total_interviews = sum(x[s_idx, t, i] 
                              for t in range(num_slots) 
                              for i in range(num_interviewers))
        model.Add(total_interviews == s['target'])
    
    # CONSTRAINT 6: No student sees the same interviewer twice
    for s_idx in range(len(students)):
        for i in range(num_interviewers):
            model.Add(sum(x[s_idx, t, i] for t in range(num_slots)) <= 1)
    
    # CONSTRAINT 7: Each student has at least min_virtual_per_student virtual interviews
    if virtual_interviewers and min_virtual_per_student > 0:
        for s_idx in range(len(students)):
            virtual_interviews = sum(x[s_idx, t, i] 
                                    for t in range(num_slots) 
                                    for i in virtual_interviewers)
            model.Add(virtual_interviews >= min_virtual_per_student)
    
    # Solve
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 60.0
    
    if seed is not None:
        solver.parameters.random_seed = seed
    
    status = solver.Solve(model)
    
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        # Extract schedule
        schedule = {}
        for s_idx, s in enumerate(students):
            schedule[s['name']] = []
            for t in range(num_slots):
                assigned = None
                for i in range(num_interviewers):
                    if solver.Value(x[s_idx, t, i]) == 1:
                        assigned = interviewers[i]['name']
                        break
                schedule[s['name']].append(assigned)
        
        # Calculate stats
        interviewer_schedule = {}
        for i in range(num_interviewers):
            inv_name = interviewers[i]['name']
            interviewer_schedule[inv_name] = []
            for t in range(num_slots):
                # Check for break using the break variable
                if solver.Value(breaks[i, t]) == 1:
                    interviewer_schedule[inv_name].append("BREAK")
                else:
                    # Check for student
                    found_student = None
                    for s_idx, s in enumerate(students):
                        if solver.Value(x[s_idx, t, i]) == 1:
                            found_student = s['name']
                            break
                    interviewer_schedule[inv_name].append(found_student)

        stats = {
            'total_interviews': sum(1 for s in schedule.values() for slot in s if slot),
            'capacity': total_capacity,
            'demand': total_demand,
            'solve_time': solver.WallTime(),
            'status': solver.StatusName(status)
        }
        
        return {
            'success': True,
            'schedule': schedule,
            'interviewer_schedule': interviewer_schedule,
            'error': None,
            'stats': stats
        }
    else:
        return {
            'success': False,
            'schedule': None,
            'error': f'Solver could not find a solution. Status: {solver.StatusName(status)}. '
                     f'Try adjusting constraints or capacity.',
            'stats': {'status': solver.StatusName(status)}
        }


def validate_schedule(schedule: dict, students: list[dict], interviewers: list[dict], 
                      num_slots: int, min_virtual: int = 1) -> list[str]:
    """Validate a schedule meets all constraints."""
    errors = []
    
    virtual_names = {inv['name'] for inv in interviewers if inv['is_virtual']}
    student_targets = {s['name']: s['target'] for s in students}
    
    # Check interview counts
    for name, slots in schedule.items():
        actual = sum(1 for s in slots if s)
        expected = student_targets.get(name, 0)
        if actual != expected:
            errors.append(f"{name}: got {actual} interviews, expected {expected}")
    
    # Check virtual requirement
    for name, slots in schedule.items():
        virt = sum(1 for s in slots if s in virtual_names)
        if virt < min_virtual:
            errors.append(f"{name}: only {virt} virtual interviews, need {min_virtual}")
    
    # Check no duplicate interviewers per student
    for name, slots in schedule.items():
        assigned = [s for s in slots if s]
        if len(assigned) != len(set(assigned)):
            errors.append(f"{name}: sees same interviewer twice")
    
    # Check no double-booking per slot
    for t in range(num_slots):
        slot_invs = [schedule[name][t] for name in schedule if schedule[name][t]]
        if len(slot_invs) != len(set(slot_invs)):
            errors.append(f"Slot #{t+1}: interviewer double-booked")
    
    return errors
