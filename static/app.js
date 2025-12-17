/**
 * Interview Scheduler - Frontend Application
 * Baylor University Style - Faculty Friendly Version
 * With Vercel Postgres Persistence
 */

// =============================================================================
// State
// =============================================================================

let currentEventId = null;
let currentEvent = null;
let students = [];  // Array of {id, name, target} - id is from database
let physicalInterviewers = [];  // Array of {id, name}
let virtualInterviewers = [];  // Array of {id, name}
let currentSchedule = null;
let lastSeedUsed = null;
let lastResult = null;
let viewMode = 'name';
let studentSortMode = 'alpha';

// Debounce timers for auto-save
let studentSaveTimeout = null;
let interviewerSaveTimeout = null;

// =============================================================================
// Initialization
// =============================================================================

async function initializeApp() {
    await loadEvents();
    updateStats();
    updateVirtualGuarantee();
}

async function loadEvents() {
    try {
        const response = await fetch('/api/events');
        const events = await response.json();

        const select = document.getElementById('event-select');
        select.innerHTML = '<option value="">-- Select an Event --</option>';

        events.forEach(event => {
            const option = document.createElement('option');
            option.value = event.id;
            option.textContent = `${event.name} (${event.year})`;
            if (event.is_active) {
                option.textContent += ' ★';
            }
            select.appendChild(option);
        });

        // If we had a previously selected event, try to restore it
        if (currentEventId) {
            select.value = currentEventId;
        }
    } catch (err) {
        console.error('Failed to load events:', err);
    }
}

async function onEventChange() {
    const select = document.getElementById('event-select');
    const eventId = select.value;

    if (!eventId) {
        currentEventId = null;
        currentEvent = null;
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('no-event-message').style.display = 'block';
        document.getElementById('edit-event-btn').style.display = 'none';
        document.getElementById('results-panel').style.display = 'none';
        return;
    }

    currentEventId = parseInt(eventId);
    await loadEventData(currentEventId);

    document.getElementById('no-event-message').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
    document.getElementById('edit-event-btn').style.display = 'inline-block';
}

async function loadEventData(eventId) {
    try {
        const response = await fetch(`/api/events/${eventId}`);
        const data = await response.json();

        currentEvent = data;

        // Load students
        students = data.students.map(s => ({
            id: s.id,
            name: s.name,
            target: s.target
        }));

        // Split interviewers by type
        physicalInterviewers = data.interviewers
            .filter(i => !i.is_virtual)
            .map(i => ({ id: i.id, name: i.name }));

        virtualInterviewers = data.interviewers
            .filter(i => i.is_virtual)
            .map(i => ({ id: i.id, name: i.name }));

        renderStudents();
        renderInterviewers();
        updateStats();

        // Update results title
        document.getElementById('results-title').textContent = data.name;

        // Load saved schedule if exists
        if (data.schedule) {
            currentSchedule = data.schedule.schedule;
            lastSeedUsed = data.schedule.seed_used;
            lastResult = {
                schedule: data.schedule.schedule,
                interviewer_schedule: data.schedule.interviewer_schedule,
                interviewer_assignments: data.schedule.interviewer_assignments,
                seed_used: data.schedule.seed_used,
                config: data.schedule.config
            };

            // Restore config if available
            if (data.schedule.config) {
                const config = data.schedule.config;
                if (config.num_slots) document.getElementById('num-slots').value = config.num_slots;
                if (config.min_virtual) document.getElementById('min-virtual').value = config.min_virtual;
                if (config.max_virtual) document.getElementById('max-virtual').value = config.max_virtual;
            }

            displaySchedule(lastResult);
        } else {
            currentSchedule = null;
            lastResult = null;
            document.getElementById('results-panel').style.display = 'none';
        }

    } catch (err) {
        console.error('Failed to load event data:', err);
        showError('Failed to load event data: ' + err.message);
    }
}


// =============================================================================
// Event Management
// =============================================================================

function showCreateEventModal() {
    document.getElementById('event-modal-title').textContent = 'Create New Event';
    document.getElementById('event-name-input').value = '';
    document.getElementById('event-year-input').value = new Date().getFullYear();
    document.getElementById('event-modal-submit').textContent = 'Create';
    document.getElementById('event-modal-submit').onclick = createEvent;
    document.getElementById('delete-event-btn').style.display = 'none';
    document.getElementById('event-modal').style.display = 'flex';
    document.getElementById('event-name-input').focus();
}

function showEditEventModal() {
    if (!currentEvent) return;

    document.getElementById('event-modal-title').textContent = 'Edit Event';
    document.getElementById('event-name-input').value = currentEvent.name;
    document.getElementById('event-year-input').value = currentEvent.year;
    document.getElementById('event-modal-submit').textContent = 'Save';
    document.getElementById('event-modal-submit').onclick = updateEvent;
    document.getElementById('delete-event-btn').style.display = 'inline-block';
    document.getElementById('event-modal').style.display = 'flex';
}

function closeEventModal() {
    document.getElementById('event-modal').style.display = 'none';
}

async function createEvent() {
    const name = document.getElementById('event-name-input').value.trim();
    const year = parseInt(document.getElementById('event-year-input').value);

    if (!name) {
        showMessage('Missing Name', 'Please enter an event name.', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, year })
        });

        const newEvent = await response.json();
        closeEventModal();

        // Reload events and select the new one
        await loadEvents();
        document.getElementById('event-select').value = newEvent.id;
        await onEventChange();

    } catch (err) {
        showError('Failed to create event: ' + err.message);
    }
}

async function updateEvent() {
    if (!currentEventId) return;

    const name = document.getElementById('event-name-input').value.trim();
    const year = parseInt(document.getElementById('event-year-input').value);

    try {
        await fetch(`/api/events/${currentEventId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, year })
        });

        closeEventModal();
        await loadEvents();
        await loadEventData(currentEventId);

    } catch (err) {
        showError('Failed to update event: ' + err.message);
    }
}

async function deleteCurrentEvent() {
    if (!currentEventId) return;

    if (await showConfirm(
        'Delete Event',
        `Are you sure you want to delete "${currentEvent.name}"?<br><br>This will permanently delete all students, interviewers, and schedules associated with this event.`,
        'warning'
    )) {
        try {
            await fetch(`/api/events/${currentEventId}`, { method: 'DELETE' });
            closeEventModal();
            currentEventId = null;
            currentEvent = null;
            await loadEvents();
            document.getElementById('event-select').value = '';
            onEventChange();
        } catch (err) {
            showError('Failed to delete event: ' + err.message);
        }
    }
}


// =============================================================================
// Student Management
// =============================================================================

function renderStudentItem(student) {
    return `
        <div class="student-item" data-id="${student.id}">
            <input type="text" value="${escapeHtml(student.name)}" 
                   onchange="updateStudentName(${student.id}, this.value)" placeholder="Student Name">
            <input type="number" value="${student.target}" min="1" max="13"
                   onchange="updateStudentTarget(${student.id}, this.value)" title="Number of interviews">
            <button class="remove-btn" onclick="removeStudent(${student.id})" title="Remove student">×</button>
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
        students.forEach(s => {
            const t = s.target;
            if (!groups[t]) groups[t] = [];
            groups[t].push(s);
        });

        const sortedTargets = Object.keys(groups).map(Number).sort((a, b) => b - a);

        let html = '';
        sortedTargets.forEach(target => {
            const groupStudents = groups[target];
            // Sort within group by last name
            groupStudents.sort((a, b) => getLastName(a.name).localeCompare(getLastName(b.name)));

            html += `
                <div class="student-group">
                    <div class="group-header">
                        <span class="header-title">${target} Interviews</span>
                        <span class="count-badge">${groupStudents.length}</span>
                    </div>
                    <div class="group-content">
                        ${groupStudents.map(s => renderStudentItem(s)).join('')}
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;
        container.className = 'student-list grouped';
    } else {
        // Sort by name
        const sortedStudents = [...students].sort((a, b) => getLastName(a.name).localeCompare(getLastName(b.name)));
        container.innerHTML = sortedStudents.map(s => renderStudentItem(s)).join('');
        container.className = 'student-list';
    }

    updateStats();
}

function getLastName(fullName) {
    if (!fullName) return '';
    const parts = fullName.trim().split(/\s+/);
    return parts.length > 0 ? parts[parts.length - 1].toLowerCase() : '';
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

async function addStudent() {
    if (!currentEventId) return;

    const defaultTarget = parseInt(document.getElementById('default-target').value) || 6;

    try {
        const response = await fetch(`/api/events/${currentEventId}/students`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'New Student', target: defaultTarget })
        });

        const newStudent = await response.json();
        students.push({
            id: newStudent.id,
            name: newStudent.name,
            target: newStudent.target
        });

        renderStudents();

        // Scroll to bottom and focus the new input
        const list = document.getElementById('student-list');
        list.scrollTop = list.scrollHeight;

    } catch (err) {
        showError('Failed to add student: ' + err.message);
    }
}

async function removeStudent(studentId) {
    if (!currentEventId) return;

    try {
        await fetch(`/api/events/${currentEventId}/students/${studentId}`, { method: 'DELETE' });
        students = students.filter(s => s.id !== studentId);
        renderStudents();
    } catch (err) {
        showError('Failed to remove student: ' + err.message);
    }
}

async function clearStudents() {
    if (!currentEventId) return;

    if (await showConfirm('Clear All Students', 'Are you sure you want to remove all students? This cannot be undone.', 'warning')) {
        try {
            await fetch(`/api/events/${currentEventId}/students`, { method: 'DELETE' });
            students = [];
            renderStudents();
        } catch (err) {
            showError('Failed to clear students: ' + err.message);
        }
    }
}

function updateStudentName(studentId, name) {
    const student = students.find(s => s.id === studentId);
    if (student) {
        student.name = name;
        debouncedSaveStudent(studentId);
    }
}

function updateStudentTarget(studentId, target) {
    const student = students.find(s => s.id === studentId);
    if (student) {
        student.target = parseInt(target) || 6;
        debouncedSaveStudent(studentId);
        if (studentSortMode === 'count') {
            renderStudents();
        } else {
            updateStats();
        }
    }
}

function debouncedSaveStudent(studentId) {
    // Debounce API calls
    if (studentSaveTimeout) clearTimeout(studentSaveTimeout);
    studentSaveTimeout = setTimeout(() => saveStudent(studentId), 500);
}

async function saveStudent(studentId) {
    if (!currentEventId) return;

    const student = students.find(s => s.id === studentId);
    if (!student) return;

    try {
        await fetch(`/api/events/${currentEventId}/students/${studentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: student.name, target: student.target })
        });
    } catch (err) {
        console.error('Failed to save student:', err);
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

async function processBulkAdd() {
    if (!currentEventId) return;

    const input = document.getElementById('bulk-input').value;
    const names = input.split('\n')
        .map(n => n.trim())
        .filter(n => n.length > 0);

    if (names.length === 0) {
        closeBulkModal();
        return;
    }

    const defaultTarget = parseInt(document.getElementById('default-target').value) || 6;

    try {
        const response = await fetch(`/api/events/${currentEventId}/students/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ students: names, default_target: defaultTarget })
        });

        const newStudents = await response.json();
        newStudents.forEach(s => {
            students.push({ id: s.id, name: s.name, target: s.target });
        });

        renderStudents();
        closeBulkModal();

    } catch (err) {
        showError('Failed to add students: ' + err.message);
    }
}


// =============================================================================
// Interviewer Management
// =============================================================================

function renderInterviewers() {
    const physContainer = document.getElementById('physical-interviewer-list');
    const virtContainer = document.getElementById('virtual-interviewer-list');

    if (physicalInterviewers.length === 0) {
        physContainer.innerHTML = '<div style="color: #999; font-style: italic; font-size: 13px;">No in-person interviewers added.</div>';
    } else {
        const sortedPhysical = [...physicalInterviewers].sort((a, b) => getLastName(a.name).localeCompare(getLastName(b.name)));

        physContainer.innerHTML = sortedPhysical.map(item => `
            <div class="interviewer-item" data-id="${item.id}">
                <span contenteditable="true" onblur="updateInterviewerName(${item.id}, false, this.innerText)">${escapeHtml(item.name)}</span>
                <button class="remove-btn" onclick="removeInterviewer(${item.id}, false)">×</button>
            </div>
        `).join('');
    }

    if (virtualInterviewers.length === 0) {
        virtContainer.innerHTML = '<div style="color: #999; font-style: italic; font-size: 13px;">No virtual interviewers added.</div>';
    } else {
        const sortedVirtual = [...virtualInterviewers].sort((a, b) => getLastName(a.name).localeCompare(getLastName(b.name)));

        virtContainer.innerHTML = sortedVirtual.map(item => `
            <div class="interviewer-item virtual" data-id="${item.id}">
                <span contenteditable="true" onblur="updateInterviewerName(${item.id}, true, this.innerText)">${escapeHtml(item.name)}</span>
                <button class="remove-btn" onclick="removeInterviewer(${item.id}, true)">×</button>
            </div>
        `).join('');
    }

    updateStats();
}

async function addInterviewer(isVirtual) {
    if (!currentEventId) return;

    const typeLabel = isVirtual ? 'Virtual' : 'In-Person';
    const name = await showPrompt(`Add ${typeLabel} Interviewer`, `Enter name for the new ${typeLabel.toLowerCase()} interviewer:`);
    if (!name) return;

    try {
        const response = await fetch(`/api/events/${currentEventId}/interviewers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, is_virtual: isVirtual })
        });

        const newInterviewer = await response.json();

        if (isVirtual) {
            virtualInterviewers.push({ id: newInterviewer.id, name: newInterviewer.name });
        } else {
            physicalInterviewers.push({ id: newInterviewer.id, name: newInterviewer.name });
        }

        renderInterviewers();

    } catch (err) {
        showError('Failed to add interviewer: ' + err.message);
    }
}

function updateInterviewerName(interviewerId, isVirtual, newName) {
    const list = isVirtual ? virtualInterviewers : physicalInterviewers;
    const interviewer = list.find(i => i.id === interviewerId);
    if (interviewer) {
        interviewer.name = newName.trim();
        debouncedSaveInterviewer(interviewerId);
    }
}

function debouncedSaveInterviewer(interviewerId) {
    if (interviewerSaveTimeout) clearTimeout(interviewerSaveTimeout);
    interviewerSaveTimeout = setTimeout(() => saveInterviewer(interviewerId), 500);
}

async function saveInterviewer(interviewerId) {
    if (!currentEventId) return;

    // Find interviewer in either list
    let interviewer = physicalInterviewers.find(i => i.id === interviewerId);
    let isVirtual = false;
    if (!interviewer) {
        interviewer = virtualInterviewers.find(i => i.id === interviewerId);
        isVirtual = true;
    }
    if (!interviewer) return;

    try {
        await fetch(`/api/events/${currentEventId}/interviewers/${interviewerId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: interviewer.name, is_virtual: isVirtual })
        });
    } catch (err) {
        console.error('Failed to save interviewer:', err);
    }
}

async function removeInterviewer(interviewerId, isVirtual) {
    if (!currentEventId) return;

    try {
        await fetch(`/api/events/${currentEventId}/interviewers/${interviewerId}`, { method: 'DELETE' });

        if (isVirtual) {
            virtualInterviewers = virtualInterviewers.filter(i => i.id !== interviewerId);
        } else {
            physicalInterviewers = physicalInterviewers.filter(i => i.id !== interviewerId);
        }

        renderInterviewers();

    } catch (err) {
        showError('Failed to remove interviewer: ' + err.message);
    }
}


// =============================================================================
// Flexible UI Logic
// =============================================================================

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

function toggleFlexibleVirtual() {
    const isFlexible = document.getElementById('virtual-flexible').checked;
    const maxContainer = document.getElementById('virtual-max-container');
    const labelMode = document.getElementById('virtual-label-mode');

    if (isFlexible) {
        maxContainer.style.display = 'flex';
        labelMode.textContent = 'Min';
    } else {
        maxContainer.style.display = 'none';
        labelMode.textContent = 'Exact';
    }
    updateVirtualGuarantee();
}

function updateVirtualGuarantee() {
    const min = parseInt(document.getElementById('min-virtual').value) || 0;
    const textEl = document.getElementById('virtual-guarantee-text');
    if (textEl) {
        const suffix = min === 1 ? 'virtual interview' : 'virtual interviews';
        textEl.innerHTML = `<strong>${min}</strong> ${suffix}`;
    }
}


// =============================================================================
// Stats & Capacity Logic
// =============================================================================

function updateStats() {
    const totalStudents = students.length;
    const totalDemand = students.reduce((sum, s) => sum + s.target, 0);
    const totalInterviewers = physicalInterviewers.length + virtualInterviewers.length;
    const numSlots = parseInt(document.getElementById('num-slots').value) || 13;

    const breaksMin = parseInt(document.getElementById('breaks-min').value) || 1;
    const isFlexible = document.getElementById('breaks-flexible').checked;
    let breaksMax = breaksMin;

    if (isFlexible) {
        breaksMax = parseInt(document.getElementById('breaks-max').value) || 1;
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

    // Update "Most students get X interviews" text
    let modeTarget = parseInt(document.getElementById('default-target').value) || 6;

    if (totalStudents > 0) {
        const counts = {};
        students.forEach(s => {
            counts[s.target] = (counts[s.target] || 0) + 1;
        });

        let maxFreq = 0;

        Object.entries(counts).forEach(([target, freq]) => {
            const t = parseInt(target);
            if (freq > maxFreq) {
                maxFreq = freq;
                modeTarget = t;
            } else if (freq === maxFreq) {
                const currentDefault = parseInt(document.getElementById('default-target').value) || 6;
                if (t === currentDefault) {
                    modeTarget = t;
                } else if (modeTarget !== currentDefault && t > modeTarget) {
                    modeTarget = t;
                }
            }
        });
    }

    const modeTextEl = document.getElementById('most-frequent-target');
    if (modeTextEl) {
        const suffix = modeTarget === 1 ? 'interview' : 'interviews';
        modeTextEl.innerHTML = `${modeTarget} ${suffix}`;
    }

    // Detailed Capacity Summary
    const summaryEl = document.getElementById('capacity-summary');

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


// =============================================================================
// Generate Schedule
// =============================================================================

async function generateSchedule(autoBalance = false) {
    if (!currentEventId) {
        showMessage('No Event Selected', 'Please select or create an event first.', 'warning');
        return;
    }

    const btn = document.getElementById('generate-btn');
    const loading = document.getElementById('loading-overlay');
    const errorEl = document.getElementById('error-message');

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
        ...physicalInterviewers.map(i => ({ name: i.name, is_virtual: false })),
        ...virtualInterviewers.map(i => ({ name: i.name, is_virtual: true }))
    ];

    const seedInput = document.getElementById('seed').value;
    const seed = seedInput ? parseInt(seedInput) : null;

    const breaksMin = parseInt(document.getElementById('breaks-min').value) || 1;
    let breaksMax = breaksMin;
    if (document.getElementById('breaks-flexible').checked) {
        breaksMax = parseInt(document.getElementById('breaks-max').value) || breaksMin;
    }
    if (breaksMax < breaksMin) breaksMax = breaksMin;

    const minVirtual = parseInt(document.getElementById('min-virtual').value) || 1;
    let maxVirtual = minVirtual;
    if (document.getElementById('virtual-flexible').checked) {
        maxVirtual = parseInt(document.getElementById('max-virtual').value) || minVirtual;
    }
    if (maxVirtual < minVirtual) maxVirtual = minVirtual;

    const payload = {
        event_id: currentEventId,
        students: students.map(s => ({ name: s.name, target: s.target })),
        interviewers,
        num_slots: parseInt(document.getElementById('num-slots').value) || 13,
        breaks_min: breaksMin,
        breaks_max: breaksMax,
        min_virtual_per_student: minVirtual,
        max_virtual_per_student: maxVirtual,
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
    const assignmentsBody = document.getElementById('assignments-body');

    const numSlots = parseInt(document.getElementById('num-slots').value) || 13;
    const schedule = result.schedule;
    const invAssignments = result.interviewer_assignments || [];

    // Create lookup for Name -> ID if needed
    const nameToId = {};
    if (viewMode === 'id') {
        invAssignments.forEach(inv => {
            nameToId[inv.name] = inv.id;
        });
    }

    statsContainer.style.display = 'none';

    headerEl.innerHTML = `
        <tr>
            <th>Student Name</th>
            ${Array.from({ length: numSlots }, (_, i) => `<th>Slot ${i + 1}</th>`).join('')}
            <th>Total</th>
        </tr>
    `;

    const virtualNames = new Set(virtualInterviewers.map(i => i.name));
    bodyEl.innerHTML = Object.entries(schedule).map(([name, slots]) => {
        const total = slots.filter(s => s).length;
        const cells = slots.map(s => {
            if (!s) return '<td class="wait">Break</td>';
            const isVirtual = virtualNames.has(s);

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

    // Calculate total interviews per interviewer
    const interviewCounts = {};
    Object.values(schedule).forEach(studentSchedule => {
        studentSchedule.forEach(interviewerName => {
            if (interviewerName) {
                interviewCounts[interviewerName] = (interviewCounts[interviewerName] || 0) + 1;
            }
        });
    });

    // Render Assignments Table
    if (invAssignments.length > 0) {
        const assignmentsHeader = document.querySelector('#assignments-table thead tr');
        if (assignmentsHeader) {
            assignmentsHeader.innerHTML = `
                <th>Interviewer Name</th>
                <th>Assigned Table / ID</th>
                <th>Break Slot</th>
                <th>Total Interviews</th>
            `;
        }

        assignmentsBody.innerHTML = invAssignments.map(inv => {
            const breaks = inv.break_slot;
            const label = breaks.includes(',') ? 'Slots' : 'Slot';
            const breakText = breaks === 'None' ? '-' : `${label} ${breaks}`;
            const count = interviewCounts[inv.name] || 0;

            return `
            <tr>
                <td>${escapeHtml(inv.name)}</td>
                <td><strong>${escapeHtml(inv.id)}</strong></td>
                <td>${breakText}</td>
                <td>${count}</td>
            </tr>
            `;
        }).join('');
    } else {
        assignmentsBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999;">No assignment data available.</td></tr>';
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
            body: JSON.stringify({
                schedule: currentSchedule,
                num_slots: numSlots,
                virtual_interviewers: virtualInterviewers.map(i => i.name),
                format: 'xlsx'
            })
        });

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Use event name for filename if available
        const filename = currentEvent ?
            `${currentEvent.name.replace(/[^a-z0-9]/gi, '_')}_Schedule.xlsx` :
            'Interview_Schedule.xlsx';
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        showError('Export failed: ' + err.message);
    }
}


// =============================================================================
// Utilities
// =============================================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


// =============================================================================
// Modal Controller
// =============================================================================

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

        Modal.input.onkeydown = (e) => {
            if (e.key === 'Enter') finish(Modal.input.value);
            if (e.key === 'Escape') finish(null);
        };
    });
}
