from langgraph.graph import StateGraph, END
from src.state import ResearchState
from src.agents.guardrail_agent import guardrail_node
from src.agents.researcher_agent import researcher_node
from src.agents.analyst_agent import analyst_node
from src.agents.risk_assessor_agent import risk_assessor_node
from src.agents.recommender_agent import recommender_node
from src.agents.reporter_agent import reporter_node

# Define routing functions
def route_after_guardrail(state: ResearchState) -> str:
    """Route to Researcher if relevant, otherwise terminate immediately."""
    if state.get("irrelevant", False):
        return END
    return "researcher"

def route_after_researcher(state: ResearchState) -> str:
    """Route to reporter if it's a QA query, otherwise route to analyst."""
    if state.get("query_type") == "qa":
        return "reporter"
    return "analyst"


# Initialize state graph
graph = StateGraph(ResearchState)

# Add agent nodes
graph.add_node("guardrail", guardrail_node)
graph.add_node("researcher", researcher_node)
graph.add_node("analyst", analyst_node)
graph.add_node("risk_assessor", risk_assessor_node)
graph.add_node("recommender", recommender_node)
graph.add_node("reporter", reporter_node)

# Set entry point
graph.set_entry_point("guardrail")

# Set conditional routing edges
graph.add_conditional_edges(
    "guardrail",
    route_after_guardrail,
    {
        "researcher": "researcher",
        END: END
    }
)

graph.add_conditional_edges(
    "researcher",
    route_after_researcher,
    {
        "analyst": "analyst",
        "reporter": "reporter"
    }
)

# Set static edges for remaining flow
graph.add_edge("analyst", "risk_assessor")
graph.add_edge("risk_assessor", "recommender")
graph.add_edge("recommender", "reporter")
graph.add_edge("reporter", END)

# Compile graph app
app = graph.compile()
