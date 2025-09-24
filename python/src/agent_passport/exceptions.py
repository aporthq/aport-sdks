"""Custom exceptions for the Agent Passport SDK."""


class AgentPassportError(Exception):
    """Base exception for Agent Passport SDK errors."""
    
    def __init__(
        self,
        message: str,
        code: str,
        status_code: int,
        agent_id: str = None
    ):
        """
        Initialize the Agent Passport error.
        
        Args:
            message: Error message
            code: Error code
            status_code: HTTP status code
            agent_id: Agent ID that caused the error
        """
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.agent_id = agent_id
        self.name = "AgentPassportError"
    
    def __str__(self) -> str:
        """Return string representation of the error."""
        return f"{self.name}: {self.message} (code: {self.code}, status: {self.status_code})"
