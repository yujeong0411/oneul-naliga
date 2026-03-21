from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    supabase_service_key: Optional[str] = None

    kiwoom_app_key: str
    kiwoom_app_secret: str

    kis_app_key: Optional[str] = None
    kis_app_secret: Optional[str] = None

    vapid_private_key: Optional[str] = None
    vapid_public_key: Optional[str] = None
    vapid_email: Optional[str] = None

    kakao_rest_api_key: Optional[str] = None
    kakao_client_secret: Optional[str] = None

    naver_client_id: Optional[str] = None
    naver_client_secret: Optional[str] = None

    class Config:
        env_file = ".env"


settings = Settings()
