"""Question schema. Polymorphic over /sejm/term{N}/{interpellations,writtenQuestions}/{num}.

Both kinds share an identical wire shape — `kind` is derived from the source
directory at stage time, NOT from the API. All observed fields modeled with
`extra="forbid"` so silent drift in upstream API blows up tests rather than
being lost.

Audit (1066 entity files: 632 interpellation + 434 written, term=10 only):
  * num: inter 14441..15086, written 3011..3444, no overlap (unique within kind only)
  * from[]: 286 distinct mp ids (zero-padded strings); ALL resolve in mps(term=10)
  * to[]: free-text minister titles; recipientDetails[] mirrors with sent date
  * sentDate: present in 1048/1066 (missing for some 'repeated' style)
  * repeatedInterpellation: list of nested Question copies (23 docs)
  * Reply.key absent in 300/1181 cases (when prolongation=True — extension request, no real reply)
  * Reply.attachments absent in 426/1181 cases
  * Reply has fields: from(str free-text), lastModified, links, onlyAttachment(bool),
    prolongation(bool), receiptDate, key(opt str), attachments(opt list)
"""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class QuestionLink(BaseModel):
    """External link entry. Observed rels: web-description | web-body | body | reply ..."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    href: str
    rel: str


class QuestionRecipient(BaseModel):
    """Per-recipient detail with sent date. All 3 fields always present in audit."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    name: str
    sent: date | None = None
    answer_delayed_days: int | None = Field(default=None, alias="answerDelayedDays")


class QuestionAttachment(BaseModel):
    """Reply attachment. URL/name always present when attachments[] present."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    url: str = Field(alias="URL")
    name: str
    last_modified: datetime | None = Field(default=None, alias="lastModified")


class QuestionReply(BaseModel):
    """One reply (or prolongation notice) attached to a question.

    `key` is the API natural id (e.g. "DS8KLF") but is ABSENT when this entry
    is a prolongation (deadline-extension notice) instead of a real reply —
    300/1181 cases in audit. We preserve nullability rather than fabricate ids.
    """
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_text: str = Field(alias="from")
    last_modified: datetime | None = Field(default=None, alias="lastModified")
    only_attachment: bool = Field(alias="onlyAttachment")
    prolongation: bool
    receipt_date: date | None = Field(default=None, alias="receiptDate")
    key: str | None = None  # absent on prolongation entries
    links: list[QuestionLink] = Field(default_factory=list)
    attachments: list[QuestionAttachment] = Field(default_factory=list)


class Question(BaseModel):
    """Top-level question record (interpellation or writtenQuestion).

    `kind` is NOT in the wire payload — it is set by the stage layer based on
    the source directory. Modeling it on the Pydantic class lets downstream
    consumers introspect kind without needing the file path.
    """
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    term: int
    num: int
    title: str
    sent_date: date | None = Field(default=None, alias="sentDate")
    receipt_date: date | None = Field(default=None, alias="receiptDate")
    last_modified: datetime | None = Field(default=None, alias="lastModified")
    answer_delayed_days: int | None = Field(default=None, alias="answerDelayedDays")
    from_ids: list[str] = Field(default_factory=list, alias="from")
    to_recipients: list[str] = Field(default_factory=list, alias="to")
    recipient_details: list[QuestionRecipient] = Field(
        default_factory=list, alias="recipientDetails"
    )
    replies: list[QuestionReply] = Field(default_factory=list)
    links: list[QuestionLink] = Field(default_factory=list)
    # 23/1066 docs carry a 1-element list with a nested copy of the question
    # (a "previous version" pointer). Modeled to satisfy extra=forbid; the
    # raw payload is what we shred at load time.
    repeated_interpellation: list["Question"] | None = Field(
        default=None, alias="repeatedInterpellation"
    )


# Pydantic V2: forward-reference rebuild for recursive repeated_interpellation.
Question.model_rebuild()
