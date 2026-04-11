from sqlalchemy import Column, Integer, String, DateTime,  Boolean, ForeignKey, Float, Date, CheckConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import Boolean



# ======================
# User
# ======================
class User(Base):
    __tablename__ = "user"
    
    user_id = Column(Integer, primary_key=True, index=True)
    user_name = Column(String, nullable=False)
    user_account = Column(String, unique=True, nullable=False)
    user_pw = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    email_verified = Column(Boolean, default=False, nullable=False)
    verify_token = Column(String, unique=True, nullable=True)
    verify_token_expires_at = Column(DateTime, nullable=True)

    reset_code = Column(String, nullable=True)
    reset_code_expires_at = Column(DateTime, nullable=True)
    reset_code_verified = Column(Boolean, default=False, nullable=False)

    sites = relationship("Site", back_populates="owner")


# ======================
# Site
# ======================
class Site(Base):
    __tablename__ = "site"

    site_id = Column(Integer, primary_key=True, index=True)
    site_code = Column(String, nullable=False)
    site_name = Column(String, nullable=False)
    location = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user_id = Column(Integer, ForeignKey("user.user_id"), nullable=False)
    owner = relationship("User", back_populates="sites")

    site_data = relationship("SiteData", back_populates="site", cascade="all, delete")
    uploads = relationship("Upload", back_populates="site")


# ======================
# Upload（⭐ 新核心）
# ======================
class Upload(Base):
    __tablename__ = "upload"

    upload_id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("site.site_id"), nullable=False)
    file_name = Column(String, nullable=False)
    upload_time = Column(DateTime, default=datetime.utcnow)

    site = relationship("Site", back_populates="uploads")
    data = relationship("SiteData", back_populates="upload")
    after_data = relationship("AfterData", back_populates="upload")


# ======================
# SiteData（每一筆）
# ======================
class SiteData(Base):
    __tablename__ = "site_data"

    data_id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("site.site_id"), nullable=False)
    upload_id = Column(Integer, ForeignKey("upload.upload_id"), nullable=False)

    the_date = Column(Date, nullable=False)
    the_hour = Column(Integer, nullable=False)
    gi = Column(Float, nullable=True)
    tm = Column(Float, nullable=True)
    eac = Column(Float, nullable=True)
    data_name = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    site = relationship("Site", back_populates="site_data")
    upload = relationship("Upload", back_populates="data")


# ======================
# AfterData（清洗後 dataset）
# ======================
class AfterData(Base):
    __tablename__ = "after_data"

    after_id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("site.site_id"), nullable=False)
    upload_id = Column(Integer, ForeignKey("upload.upload_id"), nullable=False)

    after_name = Column(String, nullable=False)
    before_rows = Column(Integer, nullable=False)
    after_rows = Column(Integer, nullable=False)
    removed_ratio = Column(Float, nullable=False)
    outlier_method = Column(String, nullable=True)
    gi_tm_applied = Column(Boolean, nullable=False)
    outlier_params = Column(JSONB, nullable=True)
    file_path = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    upload = relationship("Upload", back_populates="after_data")


# ======================
# TrainedModel（ 最重要）
# ======================
class TrainedModel(Base):
    __tablename__ = "trained_model"

    model_id = Column(Integer, primary_key=True, index=True)

    upload_id = Column(Integer, ForeignKey("upload.upload_id"), nullable=True)
    after_id = Column(Integer, ForeignKey("after_data.after_id"), nullable=True)

    model_type = Column(String, nullable=False)
    parameters = Column(JSONB, nullable=True)
    file_path = Column(String, nullable=True)
    trained_at = Column(DateTime, default=datetime.utcnow)
    usage_count = Column(Integer, default=0)

    rmse = Column(Float, nullable=True)
    r2 = Column(Float, nullable=True)
    mae = Column(Float, nullable=True)
    wmape = Column(Float, nullable=True)

    metrics = Column(JSONB, nullable=True)

    __table_args__ = (
        CheckConstraint(
            "(upload_id IS NOT NULL AND after_id IS NULL) OR (upload_id IS NULL AND after_id IS NOT NULL)",
            name="check_data_source"
        ),
    )

#=========
