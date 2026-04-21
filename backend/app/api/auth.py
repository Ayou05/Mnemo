from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.response import ApiResponse
from app.core.security import verify_password, get_password_hash, create_access_token, decode_access_token, oauth2_scheme
from app.models.models import User
from app.schemas.schemas import UserCreate, UserLogin, UserOut, Token

router = APIRouter()


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check duplicate
    existing = await db.execute(select(User).where(User.username == body.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名已存在")

    existing_email = await db.execute(select(User).where(User.email == body.email))
    if existing_email.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="邮箱已被注册")

    user = User(
        username=body.username,
        email=body.email,
        hashed_password=get_password_hash(body.password),
        nickname=body.nickname or body.username,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    token = create_access_token({"sub": user.id})
    return ApiResponse.success(data=Token(
        access_token=token,
        user=UserOut.model_validate(user),
    ).model_dump())


@router.post("/login")
async def login(body: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="账号已被禁用")

    token = create_access_token({"sub": user.id})
    return ApiResponse.success(data=Token(
        access_token=token,
        user=UserOut.model_validate(user),
    ).model_dump())


@router.get("/me")
async def get_me(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)):
    payload = decode_access_token(token)
    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return ApiResponse.success(data=UserOut.model_validate(user).model_dump())
