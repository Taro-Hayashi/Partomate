from app.database import Base, SessionLocal, engine
from app.seed_data import seed_initial_data


def main():
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        inserted = seed_initial_data(db)
        if inserted:
            print("Initial sample data inserted.")
        else:
            print("Initial sample data skipped because parts or products already exist.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
