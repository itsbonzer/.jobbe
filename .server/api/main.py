from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .companies.routes import router as companies_router
from .jobs.routes import router as jobs_router
from .preferences.routes import router as preferences_router


app = FastAPI(title="Jobbe API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(companies_router)
app.include_router(jobs_router)
app.include_router(preferences_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.exception_handler(HTTPException)
async def http_exception_handler(
    _request: Request,
    exc: HTTPException,
) -> JSONResponse:
    detail = exc.detail if isinstance(exc.detail, str) else "Request failed."
    return JSONResponse(status_code=exc.status_code, content={"error": detail})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    _request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    first_error = exc.errors()[0] if exc.errors() else {}
    message = str(first_error.get("msg") or "Invalid request.")
    return JSONResponse(status_code=422, content={"error": message})
