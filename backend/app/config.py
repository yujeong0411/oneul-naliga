from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str

    kiwoom_app_key: str
    kiwoom_app_secret: str

    kis_app_key: str
    kis_app_secret: str

    telegram_bot_token: str
    telegram_chat_id: str

    class Config:
        env_file = ".env"


settings = Settings()
