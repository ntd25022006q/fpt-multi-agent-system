import operator
from typing import Annotated, TypedDict
from langchain_core.messages import BaseMessage

class ResearchState(TypedDict):
    """The state of the RAG-Enhanced Multi-Agent Research & Analysis system.
    
    Attributes:
        topic: The topic or question to research and analyze.
        research_data: Collected facts and research gathered.
        analysis: Trade-off and core analytical comparisons.
        risks: Identified risks, likelihood/impact scoring, and mitigation.
        recommendations: Key strategic recommendations and KPIs.
        report: Final compiled markdown report.
        messages: Historical communication messages between agents.
        irrelevant: True if the topic is outside consulting scope.
        csv_data: Simulated CSV data for export.
    """
    topic: str
    research_data: str
    analysis: str
    risks: str
    recommendations: str
    report: str
    messages: Annotated[list[BaseMessage], operator.add]
    irrelevant: bool
    csv_data: str
    retrieved_context: str
    citations: list[str]
    query_type: str
    language: str



