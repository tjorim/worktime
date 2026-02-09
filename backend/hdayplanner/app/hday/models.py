from typing import List, Optional, Literal
from pydantic import BaseModel, Field

Flag = Literal['half_am','half_pm','business','course','in','holiday']

class HdayEvent(BaseModel):
    type: Literal['range','weekly','unknown']
    start: Optional[str] = None
    end: Optional[str] = None
    weekday: Optional[int] = None
    flags: List[Flag] = Field(default_factory=list)
    title: Optional[str] = ''
    raw: Optional[str] = ''

class HdayDocument(BaseModel):
    raw: str
    events: List[HdayEvent]
