"""Pydantic request/response models for the HTTP API."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------- requests


class InboundLeadIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    company: str | None = Field(None, max_length=200)
    phone: str | None = Field(None, max_length=50)
    message: str = Field(min_length=3, max_length=4000)


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


# ---------------------------------------------------------------- responses


class LeadOut(ORM):
    id: str
    name: str
    email: str
    phone: str | None
    company: str | None
    source: str
    status: str
    requirement: str | None
    budget_usd: int | None
    timeline: str | None
    timeline_days: int | None
    authority: str | None
    company_size: int | None
    notes: str | None
    score: int
    score_breakdown: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class MessageOut(ORM):
    id: int
    seq: int
    role: str
    content: str
    created_at: datetime


class ConversationSummary(BaseModel):
    id: str
    lead_id: str | None
    lead_name: str | None
    lead_company: str | None
    lead_score: int | None
    lead_status: str | None
    channel: str
    status: str
    message_count: int
    last_message: str | None
    created_at: datetime
    updated_at: datetime


class AppointmentOut(ORM):
    id: str
    lead_id: str
    title: str
    start_at: datetime
    end_at: datetime
    status: str
    meeting_url: str | None
    created_at: datetime
    lead_name: str | None = None
    lead_company: str | None = None
    lead_email: str | None = None


class AgentActionOut(ORM):
    id: int
    conversation_id: str | None
    lead_id: str | None
    tool: str
    input: dict[str, Any]
    output: Any
    status: str
    duration_ms: int
    created_at: datetime
    lead_name: str | None = None


class EmailOut(ORM):
    id: int
    lead_id: str | None
    to: str
    subject: str
    body: str
    status: str
    created_at: datetime


class ConversationDetail(BaseModel):
    id: str
    status: str
    channel: str
    created_at: datetime
    lead: LeadOut | None
    messages: list[MessageOut]
    actions: list[AgentActionOut]


class LeadDetail(BaseModel):
    lead: LeadOut
    conversations: list[ConversationSummary]
    appointments: list[AppointmentOut]
    actions: list[AgentActionOut]
    emails: list[EmailOut]


class InboundResult(BaseModel):
    conversation_id: str
    reply: str
    actions: list[dict[str, Any]]
    lead: dict[str, Any] | None
    error: str | None = None
