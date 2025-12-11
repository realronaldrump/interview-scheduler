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
function renderStudents() {
    const container = document.getElementById('student-list');

    if (students.length === 0) {
        container.innerHTML = '<div style="color: #666; padding: 10px; width: 100%; text-align: center; font-style: italic;">No students added yet. Click "+ Add Student" or "Paste List" to begin.</div>';
    } else {
        container.innerHTML = students.map((s, i) => `
            <div class="student-item" data-index="${i}">
                <input type="text" value="${escapeHtml(s.name)}" 
                       onchange="updateStudentName(${i}, this.value)" placeholder="Student Name">
                <input type="number" value="${s.target}" min="1" max="13"
                       onchange="updateStudentTarget(${i}, this.value)" title="Number of interviews">
                <button class="remove-btn" onclick="removeStudent(${i})" title="Remove student">×</button>
            </div>
        `).join('');
    }
    updateStats();
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

function clearStudents() {
    if (confirm('Are you sure you want to remove all students?')) {
        students = [];
        renderStudents();
    }
}

function updateStudentName(index, name) {
    students[index].name = name;
}

function updateStudentTarget(index, target) {
    students[index].target = parseInt(target) || 6;
    updateStats();
}

function applyDefaultTarget() {
    const newDefault = parseInt(document.getElementById('default-target').value) || 6;
    // Don't overwrite existing targets automatically, just useful for new ones.
    // But maybe we want a "Apply to all" button? 
    // For now, let's just leave it impacting new students.
    // If the user wants to apply to all, we could add that feature, 
    // but typically they might have customized some.
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

function addInterviewer(isVirtual) {
    const typeLabel = isVirtual ? 'Virtual' : 'In-Person';
    const name = prompt(`Enter Name for ${typeLabel} Interviewer:`);
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
    // No visual re-render needed as we used contenteditable, but good to clean up
}

function removeInterviewer(type, index) {
    if (type === 'physical') {
        physicalInterviewers.splice(index, 1);
    } else {
        virtualInterviewers.splice(index, 1);
    }
    renderInterviewers();
}

// Stats & Capacity Logic
function updateStats() {
    const totalStudents = students.length;
    const totalDemand = students.reduce((sum, s) => sum + s.target, 0);
    const totalInterviewers = physicalInterviewers.length + virtualInterviewers.length;
    const numSlots = parseInt(document.getElementById('num-slots').value) || 13;
    const breaks = parseInt(document.getElementById('breaks').value) || 1;
    const capacity = totalInterviewers * (numSlots - breaks);

    document.getElementById('student-count').textContent = `${totalStudents} students`;
    document.getElementById('student-demand').textContent = `Total interviews needed: ${totalDemand}`;
    document.getElementById('interviewer-count').textContent = `${totalInterviewers} interviewers`;
    document.getElementById('capacity-display').textContent = `Available interview slots: ${capacity}`;

    // Detailed Capacity Summary
    const summaryEl = document.getElementById('capacity-summary');
    const diff = capacity - totalDemand;

    if (diff === 0) {
        summaryEl.innerHTML = `<span class="match">Perfect Match!</span> Supply equals Demand (${capacity} each).`;
    } else if (diff > 0) {
        summaryEl.innerHTML = `<span class="match">Good.</span> You have ${diff} extra interview slots available.`;
    } else {
        const deficit = Math.abs(diff);
        summaryEl.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span class="mismatch">Warning:</span> 
                <span>You need <strong>${deficit} more slots</strong>.</span>
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

function runAutoBalance(deficit) {
    if (confirm(`You are over capacity by ${deficit} interviews.\n\nThis will RANDOMLY reduce ${deficit} students' interview counts (e.g. from 6 to 5) to make the schedule fit.\n\nProceed?`)) {
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
        alert("Please add at least one student.");
        return;
    }
    const totalInterviewers = physicalInterviewers.length + virtualInterviewers.length;
    if (totalInterviewers === 0) {
        alert("Please add at least one interviewer.");
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

    const payload = {
        students,
        interviewers,
        num_slots: parseInt(document.getElementById('num-slots').value) || 13,
        breaks_per_interviewer: parseInt(document.getElementById('breaks').value) || 1,
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
            if (!seedInput) {
                // Determine a seed was used if not provided
                // But we don't necessarily need to show it aggressively in the simple UI
            }

            // Sync updated student targets if auto-balanced
            if (result.students_used) {
                // Update local state with the actual targets used by server
                result.students_used.forEach((serverStudent, i) => {
                    // Match by name or index. Since order is preserved in Python list, index is safe if list didn't change
                    // But names are safer.
                    const localStudent = students.find(s => s.name === serverStudent.name);
                    if (localStudent) {
                        localStudent.target = serverStudent.target;
                    }
                });
                renderStudents(); // Reflect new counts in UI
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

function displaySchedule(result) {
    const panel = document.getElementById('results-panel');
    const statsContainer = document.getElementById('results-stats');
    const headerEl = document.getElementById('schedule-header');
    const bodyEl = document.getElementById('schedule-body');

    const numSlots = parseInt(document.getElementById('num-slots').value) || 13;
    const schedule = result.schedule;
    const stats = result.stats;

    // Simple Stats for faculty
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

    // Header
    headerEl.innerHTML = `
        <tr>
            <th>Student Name</th>
            ${Array.from({ length: numSlots }, (_, i) => `<th>Slot ${i + 1}</th>`).join('')}
            <th>Total</th>
        </tr>
    `;

    // Body
    const virtualNames = new Set(virtualInterviewers);
    bodyEl.innerHTML = Object.entries(schedule).map(([name, slots]) => {
        const total = slots.filter(s => s).length;
        const cells = slots.map(s => {
            if (!s) return '<td class="wait">Break</td>';
            const isVirtual = virtualNames.has(s);
            return `<td class="${isVirtual ? 'virtual' : 'physical'}">${escapeHtml(s)}</td>`;
        }).join('');
        return `
            <tr>
                <td>${escapeHtml(name)}</td>
                ${cells}
                <td class="total">${total}</td>
            </tr>
        `;
    }).join('');

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

// Export
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
