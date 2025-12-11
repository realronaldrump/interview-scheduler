/**
 * Interview Scheduler - Frontend Application
 * Baylor University Style - Faculty Friendly Version
 */

// State
let students = [];
let physicalInterviewers = [];
let virtualInterviewers = [];
let currentSchedule = null;
let lastSeedUsed = null;
let lastResult = null;
let viewMode = 'name';
let studentSortMode = 'added';

// Initialize
function initializeApp(defaultStudents, defaultPhysical, defaultVirtual) {
    // Load students with default target
    const defaultTarget = parseInt(document.getElementById('default-target').value) || 6;
    students = defaultStudents.map(name => ({ name, target: defaultTarget }));

    physicalInterviewers = [...defaultPhysical];
    virtualInterviewers = [...defaultVirtual];

    renderStudents();
    renderInterviewers();
    updateStats();
}

// Student Management
function renderStudentItem(index, name, target) {
    return `
        <div class="student-item" data-index="${index}">
            <input type="text" value="${escapeHtml(name)}" 
                   onchange="updateStudentName(${index}, this.value)" placeholder="Student Name">
            <input type="number" value="${target}" min="1" max="13"
                   onchange="updateStudentTarget(${index}, this.value)" title="Number of interviews">
            <button class="remove-btn" onclick="removeStudent(${index})" title="Remove student">×</button>
        </div>
    `;
}

function renderStudents() {
    const container = document.getElementById('student-list');

    if (students.length === 0) {
        container.innerHTML = '<div style="color: #666; padding: 10px; width: 100%; text-align: center; font-style: italic;">No students added yet. Click "+ Add Student" or "Paste List" to begin.</div>';
        container.className = 'student-list';
        return;
    }

    if (studentSortMode === 'count') {
        const groups = {};
        students.forEach((s, i) => {
            const t = s.target;
            if (!groups[t]) groups[t] = [];
            groups[t].push({ ...s, originalIndex: i });
        });

        const sortedTargets = Object.keys(groups).map(Number).sort((a, b) => b - a);

        let html = '';
        sortedTargets.forEach(target => {
            const groupStudents = groups[target];
            html += `
                <div class="student-group">
                    <div class="group-header">
                        <span class="header-title">${target} Interviews</span>
                        <span class="count-badge">${groupStudents.length}</span>
                    </div>
                    <div class="group-content">
                        ${groupStudents.map(s => renderStudentItem(s.originalIndex, s.name, s.target)).join('')}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        container.className = 'student-list grouped';
    } else {
        container.innerHTML = students.map((s, i) => renderStudentItem(i, s.name, s.target)).join('');
        container.className = 'student-list';
    }

    updateStats();
}

function updateStudentSort() {
    const radios = document.getElementsByName('student-sort');
    for (const radio of radios) {
        if (radio.checked) {
            studentSortMode = radio.value;
            break;
        }
    }
    renderStudents();
}

function addStudent() {
    const defaultTarget = parseInt(document.getElementById('default-target').value) || 6;
    students.push({ name: 'New Student', target: defaultTarget });
    renderStudents();

    // Scroll to bottom of list
    const list = document.getElementById('student-list');
    list.scrollTop = list.scrollHeight;
}

function removeStudent(index) {
    students.splice(index, 1);
    renderStudents();
}

async function clearStudents() {
    if (await showConfirm('Clear All Students', 'Are you sure you want to remove all students? This cannot be undone.', 'warning')) {
        students = [];
        renderStudents();
    }
}

function updateStudentName(index, name) {
    students[index].name = name;
}

function updateStudentTarget(index, target) {
    students[index].target = parseInt(target) || 6;
    if (studentSortMode === 'count') {
        renderStudents();
    } else {
        updateStats();
    }
}

function applyDefaultTarget() {
    // Optional utility to apply default to all
}

function bulkAddStudents() {
    document.getElementById('bulk-modal').style.display = 'flex';
    document.getElementById('bulk-input').value = '';
    document.getElementById('bulk-input').focus();
}

function closeBulkModal() {
    document.getElementById('bulk-modal').style.display = 'none';
}

function processBulkAdd() {
    const input = document.getElementById('bulk-input').value;
    const names = input.split('\n')
        .map(n => n.trim())
        .filter(n => n.length > 0);

    if (names.length === 0) {
        closeBulkModal();
        return;
    }

    const defaultTarget = parseInt(document.getElementById('default-target').value) || 6;
    names.forEach(name => {
        students.push({ name, target: defaultTarget });
    });

    renderStudents();
    closeBulkModal();
}

// Interviewer Management
function renderInterviewers() {
    const physContainer = document.getElementById('physical-interviewer-list');
    const virtContainer = document.getElementById('virtual-interviewer-list');

    if (physicalInterviewers.length === 0) {
        physContainer.innerHTML = '<div style="color: #999; font-style: italic; font-size: 13px;">No in-person interviewers added.</div>';
    } else {
        physContainer.innerHTML = physicalInterviewers.map((name, i) => `
            <div class="interviewer-item">
                <span contenteditable="true" onblur="updateInterviewerName('physical', ${i}, this.innerText)">${escapeHtml(name)}</span>
                <button class="remove-btn" onclick="removeInterviewer('physical', ${i})">×</button>
            </div>
        `).join('');
    }

    if (virtualInterviewers.length === 0) {
        virtContainer.innerHTML = '<div style="color: #999; font-style: italic; font-size: 13px;">No virtual interviewers added.</div>';
    } else {
        virtContainer.innerHTML = virtualInterviewers.map((name, i) => `
            <div class="interviewer-item virtual">
                <span contenteditable="true" onblur="updateInterviewerName('virtual', ${i}, this.innerText)">${escapeHtml(name)}</span>
                <button class="remove-btn" onclick="removeInterviewer('virtual', ${i})">×</button>
            </div>
        `).join('');
    }

    updateStats();
}

async function addInterviewer(isVirtual) {
    const typeLabel = isVirtual ? 'Virtual' : 'In-Person';
    const name = await showPrompt(`Add ${typeLabel} Interviewer`, `Enter name for the new ${typeLabel.toLowerCase()} interviewer:`);
    if (!name) return;

    if (isVirtual) {
        virtualInterviewers.push(name);
    } else {
        physicalInterviewers.push(name);
    }

    renderInterviewers();
}

function updateInterviewerName(type, index, newName) {
    if (type === 'physical') {
        physicalInterviewers[index] = newName.trim();
    } else {
        virtualInterviewers[index] = newName.trim();
    }
}

function removeInterviewer(type, index) {
    if (type === 'physical') {
        physicalInterviewers.splice(index, 1);
    } else {
        virtualInterviewers.splice(index, 1);
    }
    renderInterviewers();
}

// Flexible UI Logic
function toggleFlexibleBreaks() {
    const isFlexible = document.getElementById('breaks-flexible').checked;
    const maxContainer = document.getElementById('breaks-max-container');
    const labelMode = document.getElementById('breaks-label-mode');

    if (isFlexible) {
        maxContainer.style.display = 'flex';
        labelMode.textContent = 'Min';
    } else {
        maxContainer.style.display = 'none';
        labelMode.textContent = 'Exact';
    }
    updateStats();
}

// Stats & Capacity Logic
function updateStats() {
    const totalStudents = students.length;
    const totalDemand = students.reduce((sum, s) => sum + s.target, 0);
    const totalInterviewers = physicalInterviewers.length + virtualInterviewers.length;
    const numSlots = parseInt(document.getElementById('num-slots').value) || 13;

    // Calculate breaks - if flexible, use average for capacity estimation
    const breaksMin = parseInt(document.getElementById('breaks-min').value) || 1;
    const isFlexible = document.getElementById('breaks-flexible').checked;
    let breaksMax = breaksMin;
    let effectiveBreaks = breaksMin;

    if (isFlexible) {
        breaksMax = parseInt(document.getElementById('breaks-max').value) || 1;
        // Conservative estimate: use max breaks for capacity to avoid over-promising
        // Or user average? Let's use MIN breaks for "Available Slots" to show potential MAXIMUM capacity
        // But maybe show a range? Let's stick to simple for now: use Min breaks to show best case.
        effectiveBreaks = breaksMin;
    }

    const capacityMin = totalInterviewers * (numSlots - breaksMax);
    const capacityMax = totalInterviewers * (numSlots - breaksMin);

    let capacityText = `${capacityMin}`;
    if (capacityMin !== capacityMax) {
        capacityText = `${capacityMin} - ${capacityMax}`;
    }

    document.getElementById('student-count').textContent = `${totalStudents} students`;
    document.getElementById('student-demand').textContent = `Total interviews needed: ${totalDemand}`;
    document.getElementById('interviewer-count').textContent = `${totalInterviewers} interviewers`;
    document.getElementById('capacity-display').textContent = `Available slots: ${capacityText}`;

    // Detailed Capacity Summary
    const summaryEl = document.getElementById('capacity-summary');

    // For logic, use the MAX capacity to be optimistic/permissive, or MIN to be safe?
    // Using Min breaks (Max capacity) allows the solver to try its best.
    const optimisticDiff = capacityMax - totalDemand;
    const pessimisticDiff = capacityMin - totalDemand;

    if (pessimisticDiff >= 0) {
        summaryEl.innerHTML = `<span class="match">Values align.</span> Sufficient capacity (${capacityText}).`;
    } else if (optimisticDiff >= 0) {
        summaryEl.innerHTML = `<span class="match" style="color:var(--warning)">Tight Fit.</span> Demand is within the flexible range (${capacityText}). Solver might find a way.`;
    } else {
        const deficit = Math.abs(optimisticDiff);
        summaryEl.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span class="mismatch">Warning:</span> 
                <span>You need <strong>${deficit} more slots</strong> (best case).</span>
                <button class="btn btn-sm btn-gold" onclick="runAutoBalance(${deficit})">⚡ Auto-Reduce & Solve</button>
            </div>
        `;
    }
}

function updateCapacity() {
    updateStats();
}

function randomizeSeed() {
    document.getElementById('seed').value = Math.floor(Math.random() * 100000);
}

async function runAutoBalance(deficit) {
    if (await showConfirm(
        'Auto-Balance Schedule',
        `You are over capacity by ${deficit} interviews.<br><br>This will <strong>randomly reduce</strong> ${deficit} students' interview counts (e.g. from 6 to 5) to make the schedule fit.<br><br>Do you want to proceed?`,
        'warning'
    )) {
        generateSchedule(true);
    }
}

// Generate Schedule
async function generateSchedule(autoBalance = false) {
    const btn = document.getElementById('generate-btn');
    const loading = document.getElementById('loading-overlay');
    const errorEl = document.getElementById('error-message');

    // Check basic validity
    const totalStudents = students.length;
    if (totalStudents === 0) {
        showMessage('Missing Information', 'Please add at least one student.', 'warning');
        return;
    }
    const totalInterviewers = physicalInterviewers.length + virtualInterviewers.length;
    if (totalInterviewers === 0) {
        showMessage('Missing Information', 'Please add at least one interviewer.', 'warning');
        return;
    }

    btn.disabled = true;
    loading.style.display = 'flex';
    errorEl.style.display = 'none';

    // Build request
    const interviewers = [
        ...physicalInterviewers.map(name => ({ name, is_virtual: false })),
        ...virtualInterviewers.map(name => ({ name, is_virtual: true }))
    ];

    const seedInput = document.getElementById('seed').value;
    const seed = seedInput ? parseInt(seedInput) : null;

    // Parse breaks
    const breaksMin = parseInt(document.getElementById('breaks-min').value) || 1;
    let breaksMax = breaksMin;
    if (document.getElementById('breaks-flexible').checked) {
        breaksMax = parseInt(document.getElementById('breaks-max').value) || breaksMin;
    }

    // Ensure logical constraint
    if (breaksMax < breaksMin) breaksMax = breaksMin;

    const payload = {
        students,
        interviewers,
        num_slots: parseInt(document.getElementById('num-slots').value) || 13,
        breaks_min: breaksMin,
        breaks_max: breaksMax,
        min_virtual_per_student: parseInt(document.getElementById('min-virtual').value) || 1,
        seed,
        auto_balance: autoBalance
    };

    try {
        const response = await fetch('/api/solve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.success) {
            currentSchedule = result.schedule;
            lastSeedUsed = result.seed_used;
            lastResult = result;

            if (result.students_used) {
                result.students_used.forEach((serverStudent) => {
                    const localStudent = students.find(s => s.name === serverStudent.name);
                    if (localStudent) {
                        localStudent.target = serverStudent.target;
                    }
                });
                renderStudents();
            }

            displaySchedule(result);
        } else {
            showError(result.error);
        }
    } catch (err) {
        showError('Failed to connect to server: ' + err.message);
    } finally {
        btn.disabled = false;
        loading.style.display = 'none';
    }
}

function updateViewMode() {
    const radios = document.getElementsByName('view-mode');
    for (const radio of radios) {
        if (radio.checked) {
            viewMode = radio.value;
            break;
        }
    }
    if (lastResult) {
        displaySchedule(lastResult);
    }
}

function displaySchedule(result) {
    const panel = document.getElementById('results-panel');
    const statsContainer = document.getElementById('results-stats');
    const headerEl = document.getElementById('schedule-header');
    const bodyEl = document.getElementById('schedule-body');

    // New Assignments Table Elements
    const assignmentsBody = document.getElementById('assignments-body');

    const numSlots = parseInt(document.getElementById('num-slots').value) || 13;
    const schedule = result.schedule;
    const stats = result.stats;
    const invAssignments = result.interviewer_assignments || [];

    // Create lookup for Name -> ID if needed
    const nameToId = {};
    if (viewMode === 'id') {
        invAssignments.forEach(inv => {
            nameToId[inv.name] = inv.id;
        });
    }

    statsContainer.innerHTML = `
        <div class="stat-item">
            <span class="stat-label">Success</span>
            <span class="stat-value" style="color: var(--success)">Schedule Generated</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Total Interviews</span>
            <span class="stat-value">${stats.total_interviews}</span>
        </div>
        <div class="stat-item">
            <span class="stat-label">Capacity Utilization</span>
            <span class="stat-value">${Math.round(stats.total_interviews / stats.capacity * 100)}%</span>
        </div>
    `;

    headerEl.innerHTML = `
        <tr>
            <th>Student Name</th>
            ${Array.from({ length: numSlots }, (_, i) => `<th>Slot ${i + 1}</th>`).join('')}
            <th>Total</th>
        </tr>
    `;

    const virtualNames = new Set(virtualInterviewers);
    bodyEl.innerHTML = Object.entries(schedule).map(([name, slots]) => {
        const total = slots.filter(s => s).length;
        const cells = slots.map(s => {
            if (!s) return '<td class="wait">Break</td>';
            const isVirtual = virtualNames.has(s);

            // Determine display text based on viewMode
            let displayText = escapeHtml(s);
            if (viewMode === 'id' && nameToId[s]) {
                displayText = escapeHtml(nameToId[s]);
            }

            return `<td class="${isVirtual ? 'virtual' : 'physical'}">${displayText}</td>`;
        }).join('');
        return `
            <tr>
                <td>${escapeHtml(name)}</td>
                ${cells}
                <td class="total">${total}</td>
            </tr>
        `;
    }).join('');

    // Render Assignments Table
    if (invAssignments.length > 0) {
        assignmentsBody.innerHTML = invAssignments.map(inv => {
            const breaks = inv.break_slot;
            const label = breaks.includes(',') ? 'Slots' : 'Slot';
            const breakText = breaks === 'None' ? '-' : `${label} ${breaks}`;

            return `
            <tr>
                <td>${escapeHtml(inv.name)}</td>
                <td><strong>${escapeHtml(inv.id)}</strong></td>
                <td>${breakText}</td>
            </tr>
            `;
        }).join('');
    } else {
        assignmentsBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#999;">No assignment data available.</td></tr>';
    }

    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth' });
}

function showError(message) {
    const errorEl = document.getElementById('error-message');
    errorEl.innerHTML = `<strong>Error:</strong> ${message}`;
    errorEl.style.display = 'block';
    errorEl.scrollIntoView({ behavior: 'smooth' });
}

function regenerate() {
    randomizeSeed();
    generateSchedule();
}

async function exportCSV() {
    if (!currentSchedule) return;

    const numSlots = parseInt(document.getElementById('num-slots').value) || 13;

    try {
        const response = await fetch('/api/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schedule: currentSchedule, num_slots: numSlots })
        });

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'interview_schedule.csv';
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        showError('Export failed: ' + err.message);
    }
}

// Utilities
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Modal Controller
const Modal = {
    el: document.getElementById('message-modal'),
    title: document.getElementById('modal-title'),
    message: document.getElementById('modal-message'),
    inputContainer: document.getElementById('modal-input-container'),
    input: document.getElementById('modal-input'),
    actions: document.getElementById('modal-actions'),

    show: function (title, message, type = 'info', hasInput = false) {
        this.el.style.display = 'flex';
        this.el.querySelector('.modal-content').className = `modal-content ${type}`;
        this.title.innerHTML = title;
        this.message.innerHTML = message;

        if (hasInput) {
            this.inputContainer.style.display = 'block';
            this.input.value = '';
            setTimeout(() => this.input.focus(), 100);
        } else {
            this.inputContainer.style.display = 'none';
        }
    },

    hide: function () {
        this.el.style.display = 'none';
    }
};

function showMessage(title, message, type = 'info') {
    return new Promise((resolve) => {
        Modal.show(title, message, type);
        Modal.actions.innerHTML = `
            <button class="btn btn-primary" id="modal-ok-btn">OK</button>
        `;
        document.getElementById('modal-ok-btn').onclick = () => {
            Modal.hide();
            resolve();
        };
    });
}

function showConfirm(title, message, type = 'warning') {
    return new Promise((resolve) => {
        Modal.show(title, message, type);
        Modal.actions.innerHTML = `
            <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="modal-confirm-btn">Confirm</button>
        `;
        document.getElementById('modal-cancel-btn').onclick = () => {
            Modal.hide();
            resolve(false);
        };
        document.getElementById('modal-confirm-btn').onclick = () => {
            Modal.hide();
            resolve(true);
        };
    });
}

function showPrompt(title, message) {
    return new Promise((resolve) => {
        Modal.show(title, message, 'info', true);
        Modal.actions.innerHTML = `
            <button class="btn btn-secondary" id="modal-cancel-btn">Cancel</button>
            <button class="btn btn-primary" id="modal-ok-btn">OK</button>
        `;

        const finish = (val) => {
            Modal.hide();
            resolve(val);
        };

        document.getElementById('modal-cancel-btn').onclick = () => finish(null);
        document.getElementById('modal-ok-btn').onclick = () => finish(Modal.input.value);

        // Enter key to submit
        Modal.input.onkeydown = (e) => {
            if (e.key === 'Enter') finish(Modal.input.value);
            if (e.key === 'Escape') finish(null);
        };
    });
}
