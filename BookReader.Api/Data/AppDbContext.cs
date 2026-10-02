using BookReader.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace BookReader.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Book> Books => Set<Book>();

    public DbSet<SavedWord> SavedWords => Set<SavedWord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Book>(entity =>
        {
            entity.HasKey(book => book.Id);
            entity.Property(book => book.Name).IsRequired().HasMaxLength(500);
        });

        modelBuilder.Entity<SavedWord>(entity =>
        {
            entity.HasKey(savedWord => savedWord.Id);
            entity.Property(savedWord => savedWord.Original).IsRequired().HasMaxLength(4000);
            entity.Property(savedWord => savedWord.Translation).IsRequired().HasMaxLength(4000);
            entity.Property(savedWord => savedWord.CreatedAt).IsRequired();

            entity.HasOne(savedWord => savedWord.Book)
                .WithMany(book => book.SavedWords)
                .HasForeignKey(savedWord => savedWord.BookId)
                .OnDelete(DeleteBehavior.Cascade);
        });
    }
}
