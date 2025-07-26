from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator


class ExtractRequest(BaseModel):
    """POST /extract リクエストモデル"""

    html: str = Field(min_length=1, description="抽出対象のHTML文字列")
    url: HttpUrl = Field(..., description="元のURL(ログ用)")

    @field_validator("html", "url", mode="before")
    @classmethod
    def _strip_str(cls, v):
        return v.strip() if isinstance(v, str) else v


class ExtractResponse(BaseModel):
    """POST /extract レスポンスモデル"""

    title: str = Field(..., description="抽出されたページタイトル")
    text: str = Field(..., description="抽出されたクリーンテキスト")
    score: float = Field(..., description="抽出品質スコア")
    success: bool = Field(..., description="抽出が成功したかどうか")


class ExtractResult(BaseModel):
    """内部処理用の抽出結果モデル"""

    title: str | None = None
    text: str | None = None
    success: bool = False
    error_message: str | None = None


class HealthResponse(BaseModel):
    """GET /health レスポンスモデル"""

    status: Literal["healthy", "unhealthy"] = Field(..., description="サービスの健全性ステータス")
    trafilatura_available: bool = Field(..., description="Trafilaturaライブラリが利用可能かどうか")
