"""
Database models and configuration for Interview Scheduler.
Uses Flask-SQLAlchemy with Neon/Vercel Postgres.
"""

import os
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def init_db(app):
    """Initialize database connection with Neon/Vercel Postgres compatibility."""
    # Check various environment variable names (Neon/Vercel use different ones)
    database_url = (
        os.environ.get('POSTGRES_URL') or 
        os.environ.get('DATABASE_URL') or
        os.environ.get('POSTGRES_URL_NON_POOLING') or
        os.environ.get('NEON_DATABASE_URL')
    )
    
    if database_url:
        # Neon uses postgres:// but SQLAlchemy 2.0+ requires postgresql://
        if database_url.startswith('postgres://'):
            database_url = database_url.replace('postgres://', 'postgresql://', 1)
        
        # Ensure SSL mode is set for Neon (required for secure connections)
        if '?' not in database_url:
            database_url += '?sslmode=require'
        elif 'sslmode' not in database_url:
            database_url += '&sslmode=require'
    else:
        # Fallback to SQLite for local development without Postgres
        database_url = 'sqlite:///interview_scheduler.db'
    
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
        'pool_pre_ping': True,  # Handle connection drops gracefully
    }
    
    db.init_app(app)
    
    with app.app_context():
        db.create_all()


class Event(db.Model):
    """
    Represents an interview event/session (e.g., "Fall 2025 Mock Interviews").
    Each event contains its own set of students, interviewers, and schedules.
    """
    __tablename__ = 'events'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    year = db.Column(db.Integer, nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    students = db.relationship('Student', backref='event', lazy=True, cascade='all, delete-orphan')
    interviewers = db.relationship('Interviewer', backref='event', lazy=True, cascade='all, delete-orphan')
    schedules = db.relationship('Schedule', backref='event', lazy=True, cascade='all, delete-orphan')
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'year': self.year,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'student_count': len(self.students),
            'interviewer_count': len(self.interviewers),
            'has_schedule': len(self.schedules) > 0
        }


class Student(db.Model):
    """A student participating in mock interviews for a specific event."""
    __tablename__ = 'students'
    
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey('events.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    target_interviews = db.Column(db.Integer, default=6)
    
    def to_dict(self):
        return {
            'id': self.id,
            'event_id': self.event_id,
            'name': self.name,
            'target': self.target_interviews
        }


class Interviewer(db.Model):
    """An interviewer for a specific event."""
    __tablename__ = 'interviewers'
    
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey('events.id'), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    is_virtual = db.Column(db.Boolean, default=False)
    assigned_table_id = db.Column(db.String(10), nullable=True)  # A, B, C... or Z-1, Z-2...
    
    def to_dict(self):
        return {
            'id': self.id,
            'event_id': self.event_id,
            'name': self.name,
            'is_virtual': self.is_virtual,
            'assigned_table_id': self.assigned_table_id
        }


class Schedule(db.Model):
    """A generated interview schedule for an event."""
    __tablename__ = 'schedules'
    
    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey('events.id'), nullable=False)
    schedule_data = db.Column(db.JSON, nullable=False)  # The full schedule: {student_name: [interviewer1, null, interviewer2, ...]}
    interviewer_schedule = db.Column(db.JSON, nullable=True)  # {interviewer_name: [student1, "BREAK", student2, ...]}
    interviewer_assignments = db.Column(db.JSON, nullable=True)  # Table assignments and breaks
    seed_used = db.Column(db.Integer, nullable=True)
    config = db.Column(db.JSON, nullable=True)  # {num_slots, breaks_min, breaks_max, min_virtual, max_virtual}
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'event_id': self.event_id,
            'schedule': self.schedule_data,
            'interviewer_schedule': self.interviewer_schedule,
            'interviewer_assignments': self.interviewer_assignments,
            'seed_used': self.seed_used,
            'config': self.config,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
