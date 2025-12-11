"""
Zero-Slack Interview Scheduling Solver using OR-Tools CP-SAT

Problem: Schedule 36 students for interviews across 13 time slots with 17 interviewers.
This is a constraint satisfaction problem with zero slack - the supply exactly equals demand.

Constraints:
- 13 in-person interviewers (A-M) and 4 virtual interviewers (Z-1 to Z-4)
- Each interviewer gets exactly 1 break (17 * 12 = 204 total interview slots)
- Brianne Sullivan: 3 interviews
- 4 specific students (Marisol Montes, Ava Garza, Claudia Ochoa, Macy Ethridge): 5 interviews each
- 5 additional students: 5 interviews each (to make capacity work)
- Remaining 26 students: 6 interviews each
- Every student must have at least 1 virtual interview
- No student can see the same interviewer twice
- No interviewer can interview more than 1 student per slot
"""

from ortools.sat.python import cp_model
import pandas as pd
import random

# --- CONFIGURATION ---
STUDENTS = [
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

INTERVIEWERS_PHYS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M']
INTERVIEWERS_VIRT = ['Z-1', 'Z-2', 'Z-3', 'Z-4']
ALL_INTERVIEWERS = INTERVIEWERS_PHYS + INTERVIEWERS_VIRT

NUM_SLOTS = 13
NUM_INTERVIEWERS = len(ALL_INTERVIEWERS)
TOTAL_CAPACITY = NUM_INTERVIEWERS * 12  # 204 (each interviewer gets 1 break)

# Map interviewer names to indices for the solver
INV_TO_IDX = {inv: i for i, inv in enumerate(ALL_INTERVIEWERS)}
IDX_TO_INV = {i: inv for i, inv in enumerate(ALL_INTERVIEWERS)}
VIRT_INDICES = {INV_TO_IDX[inv] for inv in INTERVIEWERS_VIRT}


def setup_targets():
    """Setup interview count targets for each student."""
    targets = {s: 6 for s in STUDENTS}
    
    # Fixed special cases
    targets["Brianne Sullivan"] = 3
    for name in ["Marisol Montes", "Ava Garza", "Claudia Ochoa", "Macy Ethridge"]:
        targets[name] = 5
    
    # Calculate deficit and reduce additional students to 5
    current = sum(targets.values())
    deficit = current - TOTAL_CAPACITY  # Should be 5
    
    # Pick 5 random other students to reduce to 5 interviews
    others = [s for s in STUDENTS if targets[s] == 6]
    random.seed(42)  # For reproducibility
    random.shuffle(others)
    for i in range(deficit):
        targets[others[i]] = 5
    
    return targets


def solve_schedule():
    """Use OR-Tools CP-SAT to find a valid schedule."""
    
    targets = setup_targets()
    
    # Verify capacity
    total_demand = sum(targets.values())
    assert total_demand == TOTAL_CAPACITY, f"Demand {total_demand} != Capacity {TOTAL_CAPACITY}"
    
    model = cp_model.CpModel()
    
    # Decision variables:
    # x[s, t, i] = 1 if student s is interviewed by interviewer i at slot t
    x = {}
    for s_idx, s in enumerate(STUDENTS):
        for t in range(NUM_SLOTS):
            for i in range(NUM_INTERVIEWERS):
                x[s_idx, t, i] = model.NewBoolVar(f'x_{s_idx}_{t}_{i}')
    
    # Break variables: break[i, t] = 1 if interviewer i has break at slot t
    breaks = {}
    for i in range(NUM_INTERVIEWERS):
        for t in range(NUM_SLOTS):
            breaks[i, t] = model.NewBoolVar(f'break_{i}_{t}')
    
    # CONSTRAINT 1: Each interviewer has exactly 1 break
    for i in range(NUM_INTERVIEWERS):
        model.Add(sum(breaks[i, t] for t in range(NUM_SLOTS)) == 1)
    
    # CONSTRAINT 2: If interviewer has break at slot t, they cannot interview anyone
    for i in range(NUM_INTERVIEWERS):
        for t in range(NUM_SLOTS):
            for s_idx in range(len(STUDENTS)):
                # If break[i,t] = 1, then x[s,t,i] must be 0
                model.Add(x[s_idx, t, i] == 0).OnlyEnforceIf(breaks[i, t])
    
    # CONSTRAINT 3: Each interviewer interviews at most 1 student per slot
    for i in range(NUM_INTERVIEWERS):
        for t in range(NUM_SLOTS):
            model.Add(sum(x[s_idx, t, i] for s_idx in range(len(STUDENTS))) <= 1)
    
    # CONSTRAINT 4: Each student interviewed at most once per slot
    for s_idx in range(len(STUDENTS)):
        for t in range(NUM_SLOTS):
            model.Add(sum(x[s_idx, t, i] for i in range(NUM_INTERVIEWERS)) <= 1)
    
    # CONSTRAINT 5: Each student gets exactly their target number of interviews
    for s_idx, s in enumerate(STUDENTS):
        total_interviews = sum(x[s_idx, t, i] 
                              for t in range(NUM_SLOTS) 
                              for i in range(NUM_INTERVIEWERS))
        model.Add(total_interviews == targets[s])
    
    # CONSTRAINT 6: No student sees the same interviewer twice
    for s_idx in range(len(STUDENTS)):
        for i in range(NUM_INTERVIEWERS):
            model.Add(sum(x[s_idx, t, i] for t in range(NUM_SLOTS)) <= 1)
    
    # CONSTRAINT 7: Each student has at least 1 virtual interview
    for s_idx in range(len(STUDENTS)):
        virtual_interviews = sum(x[s_idx, t, i] 
                                for t in range(NUM_SLOTS) 
                                for i in VIRT_INDICES)
        model.Add(virtual_interviews >= 1)
    
    # CONSTRAINT 8: Each interviewer interviews exactly 12 students (13 slots - 1 break)
    for i in range(NUM_INTERVIEWERS):
        total_interviews = sum(x[s_idx, t, i] 
                              for s_idx in range(len(STUDENTS)) 
                              for t in range(NUM_SLOTS))
        model.Add(total_interviews == 12)
    
    # Solve
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 120.0
    solver.parameters.log_search_progress = True
    
    status = solver.Solve(model)
    
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        # Extract the schedule
        schedule = {s: ["WAIT"] * NUM_SLOTS for s in STUDENTS}
        
        for s_idx, s in enumerate(STUDENTS):
            for t in range(NUM_SLOTS):
                for i in range(NUM_INTERVIEWERS):
                    if solver.Value(x[s_idx, t, i]) == 1:
                        schedule[s][t] = IDX_TO_INV[i]
        
        return schedule, targets
    else:
        print(f"No solution found. Status: {solver.StatusName(status)}")
        return None, targets


def validate_schedule(schedule, targets):
    """Validate the solution meets all constraints."""
    errors = []
    
    # Check interview counts
    for s in STUDENTS:
        actual = sum(1 for x in schedule[s] if x != "WAIT")
        if actual != targets[s]:
            errors.append(f"{s}: got {actual}, expected {targets[s]}")
    
    # Check virtual requirement
    for s in STUDENTS:
        virt = sum(1 for x in schedule[s] if x in INTERVIEWERS_VIRT)
        if virt < 1:
            errors.append(f"{s}: no virtual interview")
    
    # Check no duplicate interviewers per student
    for s in STUDENTS:
        assigned = [x for x in schedule[s] if x != "WAIT"]
        if len(assigned) != len(set(assigned)):
            errors.append(f"{s}: duplicate interviewer")
    
    # Check no double-booking per slot
    for t in range(NUM_SLOTS):
        invs = [schedule[s][t] for s in STUDENTS if schedule[s][t] != "WAIT"]
        if len(invs) != len(set(invs)):
            errors.append(f"Slot #{t+1}: double-booking")
    
    return errors


def main():
    print("Solving interview scheduling problem with OR-Tools CP-SAT...")
    print(f"Students: {len(STUDENTS)}, Interviewers: {NUM_INTERVIEWERS}, Slots: {NUM_SLOTS}")
    print(f"Total capacity: {TOTAL_CAPACITY} interviews\n")
    
    schedule, targets = solve_schedule()
    
    if schedule:
        errors = validate_schedule(schedule, targets)
        
        if errors:
            print("VALIDATION ERRORS:")
            for e in errors:
                print(f"  - {e}")
        else:
            print("\n=== VALID SCHEDULE FOUND ===\n")
            
            # Create DataFrame output
            df = pd.DataFrame.from_dict(
                schedule, orient='index',
                columns=[f"#{i+1}" for i in range(NUM_SLOTS)]
            )
            df['Total'] = df.apply(lambda x: x.ne("WAIT").sum(), axis=1)
            df.index.name = "STUDENT"
            
            print(df.to_csv())
            
            # Summary
            print("\n--- SUMMARY ---")
            print(f"Total interviews scheduled: {df['Total'].sum()}")
            
            # Interview distribution
            print("\nInterview count distribution:")
            for count in sorted(df['Total'].unique()):
                num = (df['Total'] == count).sum()
                print(f"  {count} interviews: {num} students")
            
            # Virtual interviews per student
            virt_counts = {}
            for s in STUDENTS:
                virt_counts[s] = sum(1 for x in schedule[s] if x in INTERVIEWERS_VIRT)
            
            print(f"\nVirtual interview distribution:")
            for v in sorted(set(virt_counts.values())):
                num = sum(1 for x in virt_counts.values() if x == v)
                print(f"  {v} virtual: {num} students")


if __name__ == "__main__":
    main()