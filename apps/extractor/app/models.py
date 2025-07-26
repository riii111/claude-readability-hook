from pydantic import BaseModel, Field
from typing import Optional


class ExtractRequest(BaseModel):
    """POST /extract リクエストモデル"""
    html: str = Field(..., description="抽出対象のHTML文字列")
    url: str = Field(..., description="元のURL（ログ用）")


class ExtractResponse(BaseModel):
    """POST /extract レスポンスモデル"""
    title: str = Field(..., description="抽出されたページタイトル")
    text: str = Field(..., description="抽出されたクリーンテキスト")
    score: float = Field(..., description="抽出品質スコア")
    success: bool = Field(..., description="抽出が成功したかどうか")


class ExtractResult(BaseModel):
    """内部処理用の抽出結果モデル"""
    title: Optional[str] = None
    text: Optional[str] = None
    success: bool = False
    error_message: Optional[str] = None


class HealthResponse(BaseModel):
    """GET /health レスポンスモデル"""
    status: str = Field(..., description="サービスの健全性ステータス")
    trafilatura_available: bool = Field(..., description="Trafilaturaライブラリが利用可能かどうか")